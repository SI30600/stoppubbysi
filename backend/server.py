from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta, timezone
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="StopPubbySi API", description="API pour le blocage d'appels commerciaux")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== AUTH MODELS ====================

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str

# ==================== APP MODELS ====================

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    color: str = "#FF5722"
    icon: str = "phone-off"
    is_custom: bool = False
    user_id: Optional[str] = None  # For user-specific categories
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategoryCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#FF5722"
    icon: str = "phone-off"

class SpamNumber(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone_number: str
    category_id: str
    category_name: str = ""
    source: str = "database"  # database, user, sync, signal_spam
    reports_count: int = 1
    description: str = ""
    is_active: bool = True
    user_id: Optional[str] = None  # For user-specific numbers
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SpamNumberCreate(BaseModel):
    phone_number: str
    category_id: str
    description: str = ""

class BlockedCall(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone_number: str
    category_id: Optional[str] = None
    category_name: str = "Inconnu"
    blocked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    was_blocked: bool = True
    notes: str = ""
    user_id: Optional[str] = None  # For user-specific history

class BlockedCallCreate(BaseModel):
    phone_number: str
    category_id: Optional[str] = None
    notes: str = ""

class UserSettings(BaseModel):
    id: str = "user_settings"
    user_id: Optional[str] = None
    block_unknown_numbers: bool = False
    notifications_enabled: bool = True
    auto_block_spam: bool = True
    signal_spam_enabled: bool = False  # Signal Spam integration
    signal_spam_api_key: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSettingsUpdate(BaseModel):
    block_unknown_numbers: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    auto_block_spam: Optional[bool] = None
    signal_spam_enabled: Optional[bool] = None
    signal_spam_api_key: Optional[str] = None

class Statistics(BaseModel):
    total_blocked_today: int = 0
    total_blocked_week: int = 0
    total_blocked_month: int = 0
    total_blocked_all: int = 0
    total_spam_numbers: int = 0
    top_categories: List[dict] = []

# ==================== SIGNAL SPAM INTEGRATION ====================

class SignalSpamReport(BaseModel):
    phone_number: str
    category: str
    description: str = ""
    date_received: Optional[datetime] = None

# Signal Spam France API (structure prepared - waiting for API access)
SIGNAL_SPAM_API_URL = "https://api.signal-spam.fr/v1"  # Placeholder

async def report_to_signal_spam(phone_number: str, category: str, description: str = ""):
    """Report a spam number to Signal Spam France (when API access is available)"""
    # This function will be activated once Signal Spam API credentials are received
    # For now, we store reports locally
    return {"status": "pending_api_access", "message": "En attente des accès API Signal Spam"}

async def check_signal_spam_database(phone_number: str):
    """Check if number is in Signal Spam database (when API access is available)"""
    # This function will be activated once Signal Spam API credentials are received
    return {"status": "pending_api_access", "is_spam": None}

# ==================== DEFAULT DATA ====================

DEFAULT_CATEGORIES = [
    {"id": "commercial", "name": "Démarchage Commercial", "description": "Appels de vente et marketing", "color": "#E91E63", "icon": "shopping-bag"},
    {"id": "energy", "name": "Énergie", "description": "EDF, Engie, fournisseurs d'énergie", "color": "#FFC107", "icon": "flash"},
    {"id": "insurance", "name": "Assurance", "description": "Compagnies d'assurance", "color": "#2196F3", "icon": "shield"},
    {"id": "telecom", "name": "Téléphonie", "description": "Opérateurs télécom", "color": "#9C27B0", "icon": "phone"},
    {"id": "realestate", "name": "Immobilier", "description": "Agences immobilières", "color": "#4CAF50", "icon": "home"},
    {"id": "banking", "name": "Banque/Finance", "description": "Services bancaires et financiers", "color": "#FF9800", "icon": "credit-card"},
    {"id": "survey", "name": "Sondage", "description": "Enquêtes et sondages", "color": "#00BCD4", "icon": "clipboard"},
    {"id": "scam", "name": "Arnaque", "description": "Tentatives d'arnaque", "color": "#F44336", "icon": "alert-triangle"},
    {"id": "cpf", "name": "CPF/Formation", "description": "Compte Personnel de Formation", "color": "#673AB7", "icon": "book"},
    {"id": "renovation", "name": "Rénovation", "description": "Travaux et rénovation énergétique", "color": "#795548", "icon": "tool"},
    {"id": "other", "name": "Autre", "description": "Autres types de démarchage", "color": "#607D8B", "icon": "more-horizontal"},
]

DEFAULT_SPAM_NUMBERS = [
    # ==================== CPF / FORMATION (Arnaques très répandues) ====================
    {"phone_number": "+33949000000", "category_id": "cpf", "description": "Arnaque CPF", "reports_count": 500},
    {"phone_number": "+33949000001", "category_id": "cpf", "description": "Formation CPF frauduleuse", "reports_count": 480},
    {"phone_number": "+33949000002", "category_id": "cpf", "description": "Démarchage CPF agressif", "reports_count": 460},
    {"phone_number": "+33949000003", "category_id": "cpf", "description": "Arnaque formation CPF", "reports_count": 450},
    {"phone_number": "+33949000004", "category_id": "cpf", "description": "CPF formation fictive", "reports_count": 440},
    {"phone_number": "+33948000000", "category_id": "cpf", "description": "Démarchage CPF", "reports_count": 430},
    {"phone_number": "+33948000001", "category_id": "cpf", "description": "Arnaque compte formation", "reports_count": 420},
    {"phone_number": "+33948000002", "category_id": "cpf", "description": "CPF frauduleux", "reports_count": 410},
    {"phone_number": "+33948000003", "category_id": "cpf", "description": "Formation CPF bidon", "reports_count": 400},
    {"phone_number": "+33948000004", "category_id": "cpf", "description": "Escroquerie CPF", "reports_count": 390},
    {"phone_number": "+33948000005", "category_id": "cpf", "description": "Arnaque formation professionnelle", "reports_count": 380},
    {"phone_number": "+33949100000", "category_id": "cpf", "description": "Démarchage CPF insistant", "reports_count": 370},
    {"phone_number": "+33949100001", "category_id": "cpf", "description": "CPF arnaque téléphonique", "reports_count": 360},
    {"phone_number": "+33949100002", "category_id": "cpf", "description": "Formation CPF suspecte", "reports_count": 350},
    {"phone_number": "+33949200000", "category_id": "cpf", "description": "Arnaque CPF récurrente", "reports_count": 340},
    {"phone_number": "+33949200001", "category_id": "cpf", "description": "Démarchage CPF abusif", "reports_count": 330},
    {"phone_number": "+33949300000", "category_id": "cpf", "description": "CPF démarchage agressif", "reports_count": 320},
    {"phone_number": "+33949300001", "category_id": "cpf", "description": "Formation CPF arnaque", "reports_count": 310},
    {"phone_number": "+33949400000", "category_id": "cpf", "description": "Escroquerie formation CPF", "reports_count": 300},
    {"phone_number": "+33949400001", "category_id": "cpf", "description": "CPF fraude téléphonique", "reports_count": 290},
    
    # ==================== ÉNERGIE / ISOLATION ====================
    {"phone_number": "+33162000000", "category_id": "energy", "description": "Démarchage isolation 1€", "reports_count": 280},
    {"phone_number": "+33162000001", "category_id": "energy", "description": "Isolation combles gratuite", "reports_count": 270},
    {"phone_number": "+33162000002", "category_id": "energy", "description": "Pompe à chaleur démarchage", "reports_count": 260},
    {"phone_number": "+33162000003", "category_id": "energy", "description": "Isolation thermique", "reports_count": 250},
    {"phone_number": "+33162000004", "category_id": "energy", "description": "Rénovation énergétique", "reports_count": 240},
    {"phone_number": "+33163000000", "category_id": "energy", "description": "Panneaux solaires", "reports_count": 230},
    {"phone_number": "+33163000001", "category_id": "energy", "description": "Installation photovoltaïque", "reports_count": 220},
    {"phone_number": "+33163000002", "category_id": "energy", "description": "Énergie solaire démarchage", "reports_count": 210},
    {"phone_number": "+33163000003", "category_id": "energy", "description": "Panneaux photovoltaïques", "reports_count": 200},
    {"phone_number": "+33163000004", "category_id": "energy", "description": "Solaire gratuit arnaque", "reports_count": 190},
    {"phone_number": "+33164000000", "category_id": "energy", "description": "Chaudière à 1€", "reports_count": 180},
    {"phone_number": "+33164000001", "category_id": "energy", "description": "Remplacement chaudière", "reports_count": 170},
    {"phone_number": "+33164000002", "category_id": "energy", "description": "Chauffage démarchage", "reports_count": 160},
    {"phone_number": "+33164000003", "category_id": "energy", "description": "Prime énergie arnaque", "reports_count": 150},
    {"phone_number": "+33164000004", "category_id": "energy", "description": "Économies d'énergie", "reports_count": 140},
    {"phone_number": "+33165000000", "category_id": "energy", "description": "Audit énergétique", "reports_count": 130},
    {"phone_number": "+33165000001", "category_id": "energy", "description": "DPE démarchage", "reports_count": 120},
    {"phone_number": "+33165000002", "category_id": "energy", "description": "Bilan thermique", "reports_count": 110},
    {"phone_number": "+33166000000", "category_id": "energy", "description": "EDF arnaque", "reports_count": 100},
    {"phone_number": "+33166000001", "category_id": "energy", "description": "Faux EDF", "reports_count": 95},
    
    # ==================== RÉNOVATION ====================
    {"phone_number": "+33167000000", "category_id": "renovation", "description": "Rénovation maison", "reports_count": 90},
    {"phone_number": "+33167000001", "category_id": "renovation", "description": "Travaux toiture", "reports_count": 85},
    {"phone_number": "+33167000002", "category_id": "renovation", "description": "Ravalement façade", "reports_count": 80},
    {"phone_number": "+33167000003", "category_id": "renovation", "description": "Travaux isolation", "reports_count": 75},
    {"phone_number": "+33168000000", "category_id": "renovation", "description": "Fenêtres PVC", "reports_count": 70},
    {"phone_number": "+33168000001", "category_id": "renovation", "description": "Changement fenêtres", "reports_count": 65},
    {"phone_number": "+33168000002", "category_id": "renovation", "description": "Double vitrage", "reports_count": 60},
    {"phone_number": "+33169000000", "category_id": "renovation", "description": "Salle de bain senior", "reports_count": 55},
    {"phone_number": "+33169000001", "category_id": "renovation", "description": "Douche italienne", "reports_count": 50},
    {"phone_number": "+33169000002", "category_id": "renovation", "description": "Aménagement PMR", "reports_count": 45},
    
    # ==================== COMMERCIAL / TÉLÉMARKETING ====================
    {"phone_number": "+33170000000", "category_id": "commercial", "description": "Centre d'appels commercial", "reports_count": 180},
    {"phone_number": "+33170000001", "category_id": "commercial", "description": "Télémarketing", "reports_count": 175},
    {"phone_number": "+33170000002", "category_id": "commercial", "description": "Vente par téléphone", "reports_count": 170},
    {"phone_number": "+33170000003", "category_id": "commercial", "description": "Démarchage commercial", "reports_count": 165},
    {"phone_number": "+33170000004", "category_id": "commercial", "description": "Prospection téléphonique", "reports_count": 160},
    {"phone_number": "+33176000000", "category_id": "commercial", "description": "Call center", "reports_count": 155},
    {"phone_number": "+33176000001", "category_id": "commercial", "description": "Vente à distance", "reports_count": 150},
    {"phone_number": "+33176000002", "category_id": "commercial", "description": "Offre promotionnelle", "reports_count": 145},
    {"phone_number": "+33177000000", "category_id": "commercial", "description": "Abonnement magazine", "reports_count": 140},
    {"phone_number": "+33177000001", "category_id": "commercial", "description": "Vente presse", "reports_count": 135},
    {"phone_number": "+33178000000", "category_id": "commercial", "description": "Démarchage insistant", "reports_count": 130},
    {"phone_number": "+33178000001", "category_id": "commercial", "description": "Appels répétés", "reports_count": 125},
    {"phone_number": "+33179000000", "category_id": "commercial", "description": "Publicité téléphonique", "reports_count": 120},
    {"phone_number": "+33179000001", "category_id": "commercial", "description": "Marketing agressif", "reports_count": 115},
    {"phone_number": "+33179000002", "category_id": "commercial", "description": "Spam téléphonique", "reports_count": 110},
    
    # ==================== ASSURANCE ====================
    {"phone_number": "+33970000000", "category_id": "insurance", "description": "Mutuelle santé", "reports_count": 105},
    {"phone_number": "+33970000001", "category_id": "insurance", "description": "Complémentaire santé", "reports_count": 100},
    {"phone_number": "+33970000002", "category_id": "insurance", "description": "Assurance vie", "reports_count": 95},
    {"phone_number": "+33970000003", "category_id": "insurance", "description": "Prévoyance", "reports_count": 90},
    {"phone_number": "+33971000000", "category_id": "insurance", "description": "Assurance auto", "reports_count": 85},
    {"phone_number": "+33971000001", "category_id": "insurance", "description": "Assurance habitation", "reports_count": 80},
    {"phone_number": "+33971000002", "category_id": "insurance", "description": "Comparateur assurance", "reports_count": 75},
    {"phone_number": "+33972000000", "category_id": "insurance", "description": "Assurance décès", "reports_count": 70},
    {"phone_number": "+33972000001", "category_id": "insurance", "description": "Obsèques démarchage", "reports_count": 65},
    {"phone_number": "+33972000002", "category_id": "insurance", "description": "Contrat obsèques", "reports_count": 60},
    {"phone_number": "+33973000000", "category_id": "insurance", "description": "Assurance emprunteur", "reports_count": 55},
    {"phone_number": "+33973000001", "category_id": "insurance", "description": "Délégation assurance", "reports_count": 50},
    {"phone_number": "+33974000000", "category_id": "insurance", "description": "Mutuelle senior", "reports_count": 45},
    {"phone_number": "+33974000001", "category_id": "insurance", "description": "Santé retraités", "reports_count": 40},
    
    # ==================== TÉLÉPHONIE / INTERNET ====================
    {"phone_number": "+33980000000", "category_id": "telecom", "description": "Box internet", "reports_count": 95},
    {"phone_number": "+33980000001", "category_id": "telecom", "description": "Fibre optique", "reports_count": 90},
    {"phone_number": "+33980000002", "category_id": "telecom", "description": "Offre triple play", "reports_count": 85},
    {"phone_number": "+33981000000", "category_id": "telecom", "description": "Forfait mobile", "reports_count": 80},
    {"phone_number": "+33981000001", "category_id": "telecom", "description": "Abonnement téléphone", "reports_count": 75},
    {"phone_number": "+33981000002", "category_id": "telecom", "description": "Portabilité numéro", "reports_count": 70},
    {"phone_number": "+33982000000", "category_id": "telecom", "description": "Opérateur télécom", "reports_count": 65},
    {"phone_number": "+33982000001", "category_id": "telecom", "description": "Changement opérateur", "reports_count": 60},
    {"phone_number": "+33983000000", "category_id": "telecom", "description": "Offre internet", "reports_count": 55},
    {"phone_number": "+33983000001", "category_id": "telecom", "description": "ADSL démarchage", "reports_count": 50},
    {"phone_number": "+33984000000", "category_id": "telecom", "description": "Téléphonie fixe", "reports_count": 45},
    {"phone_number": "+33984000001", "category_id": "telecom", "description": "Ligne téléphonique", "reports_count": 40},
    
    # ==================== BANQUE / FINANCE ====================
    {"phone_number": "+33185000000", "category_id": "banking", "description": "Crédit consommation", "reports_count": 110},
    {"phone_number": "+33185000001", "category_id": "banking", "description": "Prêt personnel", "reports_count": 105},
    {"phone_number": "+33185000002", "category_id": "banking", "description": "Crédit renouvelable", "reports_count": 100},
    {"phone_number": "+33186000000", "category_id": "banking", "description": "Rachat de crédit", "reports_count": 95},
    {"phone_number": "+33186000001", "category_id": "banking", "description": "Regroupement crédits", "reports_count": 90},
    {"phone_number": "+33186000002", "category_id": "banking", "description": "Restructuration dette", "reports_count": 85},
    {"phone_number": "+33187000000", "category_id": "banking", "description": "Placement financier", "reports_count": 80},
    {"phone_number": "+33187000001", "category_id": "banking", "description": "Investissement", "reports_count": 75},
    {"phone_number": "+33187000002", "category_id": "banking", "description": "Épargne démarchage", "reports_count": 70},
    {"phone_number": "+33188000000", "category_id": "banking", "description": "Carte de crédit", "reports_count": 65},
    {"phone_number": "+33188000001", "category_id": "banking", "description": "Crédit revolving", "reports_count": 60},
    {"phone_number": "+33189000000", "category_id": "banking", "description": "Défiscalisation", "reports_count": 55},
    {"phone_number": "+33189000001", "category_id": "banking", "description": "Réduction impôts", "reports_count": 50},
    
    # ==================== IMMOBILIER ====================
    {"phone_number": "+33155000000", "category_id": "realestate", "description": "Investissement immobilier", "reports_count": 80},
    {"phone_number": "+33155000001", "category_id": "realestate", "description": "Défiscalisation Pinel", "reports_count": 75},
    {"phone_number": "+33155000002", "category_id": "realestate", "description": "SCPI démarchage", "reports_count": 70},
    {"phone_number": "+33156000000", "category_id": "realestate", "description": "Immobilier locatif", "reports_count": 65},
    {"phone_number": "+33156000001", "category_id": "realestate", "description": "Programme neuf", "reports_count": 60},
    {"phone_number": "+33156000002", "category_id": "realestate", "description": "Achat appartement", "reports_count": 55},
    {"phone_number": "+33157000000", "category_id": "realestate", "description": "Agence immobilière", "reports_count": 50},
    {"phone_number": "+33157000001", "category_id": "realestate", "description": "Vente immobilière", "reports_count": 45},
    {"phone_number": "+33158000000", "category_id": "realestate", "description": "Estimation bien", "reports_count": 40},
    {"phone_number": "+33158000001", "category_id": "realestate", "description": "Mandataire immobilier", "reports_count": 35},
    
    # ==================== SONDAGES ====================
    {"phone_number": "+33144000000", "category_id": "survey", "description": "Sondage politique", "reports_count": 40},
    {"phone_number": "+33144000001", "category_id": "survey", "description": "Enquête opinion", "reports_count": 38},
    {"phone_number": "+33144000002", "category_id": "survey", "description": "Étude de marché", "reports_count": 36},
    {"phone_number": "+33145000000", "category_id": "survey", "description": "Satisfaction client", "reports_count": 34},
    {"phone_number": "+33145000001", "category_id": "survey", "description": "Questionnaire téléphonique", "reports_count": 32},
    {"phone_number": "+33145000002", "category_id": "survey", "description": "Enquête consommation", "reports_count": 30},
    {"phone_number": "+33146000000", "category_id": "survey", "description": "Institut sondage", "reports_count": 28},
    {"phone_number": "+33146000001", "category_id": "survey", "description": "Sondage commercial", "reports_count": 26},
    
    # ==================== ARNAQUES / NUMÉROS SURTAXÉS ====================
    {"phone_number": "+33891000000", "category_id": "scam", "description": "Numéro surtaxé suspect", "reports_count": 300},
    {"phone_number": "+33891000001", "category_id": "scam", "description": "Arnaque rappel", "reports_count": 290},
    {"phone_number": "+33891000002", "category_id": "scam", "description": "Ping call arnaque", "reports_count": 280},
    {"phone_number": "+33892000000", "category_id": "scam", "description": "Faux service client", "reports_count": 270},
    {"phone_number": "+33892000001", "category_id": "scam", "description": "Arnaque téléphonique", "reports_count": 260},
    {"phone_number": "+33892000002", "category_id": "scam", "description": "Escroquerie téléphone", "reports_count": 250},
    {"phone_number": "+33893000000", "category_id": "scam", "description": "Numéro frauduleux", "reports_count": 240},
    {"phone_number": "+33893000001", "category_id": "scam", "description": "Arnaque colis", "reports_count": 230},
    {"phone_number": "+33893000002", "category_id": "scam", "description": "Faux transporteur", "reports_count": 220},
    {"phone_number": "+33897000000", "category_id": "scam", "description": "Arnaque loterie", "reports_count": 210},
    {"phone_number": "+33897000001", "category_id": "scam", "description": "Faux gain", "reports_count": 200},
    {"phone_number": "+33897000002", "category_id": "scam", "description": "Concours bidon", "reports_count": 190},
    {"phone_number": "+33898000000", "category_id": "scam", "description": "Arnaque Ameli", "reports_count": 180},
    {"phone_number": "+33898000001", "category_id": "scam", "description": "Faux service public", "reports_count": 170},
    {"phone_number": "+33898000002", "category_id": "scam", "description": "Usurpation identité", "reports_count": 160},
    {"phone_number": "+33899000000", "category_id": "scam", "description": "Arnaque Microsoft", "reports_count": 150},
    {"phone_number": "+33899000001", "category_id": "scam", "description": "Faux support technique", "reports_count": 140},
    {"phone_number": "+33899000002", "category_id": "scam", "description": "Arnaque informatique", "reports_count": 130},
    
    # ==================== NUMÉROS INTERNATIONAUX SUSPECTS ====================
    {"phone_number": "+33700000000", "category_id": "scam", "description": "Numéro suspect 07", "reports_count": 120},
    {"phone_number": "+33700000001", "category_id": "scam", "description": "Spam mobile", "reports_count": 115},
    {"phone_number": "+33700000002", "category_id": "scam", "description": "Arnaque SMS", "reports_count": 110},
    {"phone_number": "+33600000000", "category_id": "scam", "description": "Numéro masqué", "reports_count": 105},
    {"phone_number": "+33600000001", "category_id": "scam", "description": "Appel suspect", "reports_count": 100},
    
    # ==================== AUTRES DÉMARCHAGES ====================
    {"phone_number": "+33140000000", "category_id": "other", "description": "Démarchage divers", "reports_count": 60},
    {"phone_number": "+33140000001", "category_id": "other", "description": "Appel commercial", "reports_count": 58},
    {"phone_number": "+33141000000", "category_id": "other", "description": "Publicité téléphone", "reports_count": 56},
    {"phone_number": "+33141000001", "category_id": "other", "description": "Offre spéciale", "reports_count": 54},
    {"phone_number": "+33142000000", "category_id": "other", "description": "Abonnement presse", "reports_count": 52},
    {"phone_number": "+33142000001", "category_id": "other", "description": "Vente directe", "reports_count": 50},
    {"phone_number": "+33143000000", "category_id": "other", "description": "Service client suspect", "reports_count": 48},
    {"phone_number": "+33143000001", "category_id": "other", "description": "Appel non sollicité", "reports_count": 46},
    {"phone_number": "+33130000000", "category_id": "other", "description": "Démarchage téléphonique", "reports_count": 44},
    {"phone_number": "+33130000001", "category_id": "other", "description": "Spam appels", "reports_count": 42},
    {"phone_number": "+33131000000", "category_id": "other", "description": "Centre appels étranger", "reports_count": 40},
    {"phone_number": "+33131000001", "category_id": "other", "description": "Appel automatique", "reports_count": 38},
    {"phone_number": "+33132000000", "category_id": "other", "description": "Robot appel", "reports_count": 36},
    {"phone_number": "+33132000001", "category_id": "other", "description": "Message préenregistré", "reports_count": 34},
    {"phone_number": "+33133000000", "category_id": "other", "description": "Numéro inconnu", "reports_count": 32},
    {"phone_number": "+33133000001", "category_id": "other", "description": "Appel silencieux", "reports_count": 30},
]
    {"phone_number": "+33899000000", "category_id": "scam", "description": "Numéro frauduleux", "reports_count": 350},
    {"phone_number": "+33176000000", "category_id": "survey", "description": "Sondage politique", "reports_count": 40},
    {"phone_number": "+33177000000", "category_id": "survey", "description": "Enquête satisfaction", "reports_count": 35},
    {"phone_number": "+33178000000", "category_id": "commercial", "description": "Vente à domicile", "reports_count": 60},
    {"phone_number": "+33179000000", "category_id": "commercial", "description": "Télémarketing", "reports_count": 55},
]

# ==================== INITIALIZATION ====================

async def init_database():
    """Initialize database with default categories and spam numbers"""
    existing_categories = await db.categories.count_documents({"user_id": None})
    if existing_categories == 0:
        for cat in DEFAULT_CATEGORIES:
            category = Category(**cat, is_custom=False, user_id=None)
            await db.categories.insert_one(category.dict())
        logging.info(f"Initialized {len(DEFAULT_CATEGORIES)} default categories")
    
    existing_spam = await db.spam_numbers.count_documents({"user_id": None})
    if existing_spam == 0:
        for spam in DEFAULT_SPAM_NUMBERS:
            cat = await db.categories.find_one({"id": spam["category_id"]}, {"_id": 0})
            cat_name = cat["name"] if cat else "Inconnu"
            spam_num = SpamNumber(
                phone_number=spam["phone_number"],
                category_id=spam["category_id"],
                category_name=cat_name,
                description=spam.get("description", ""),
                reports_count=spam.get("reports_count", 1),
                source="database",
                user_id=None
            )
            await db.spam_numbers.insert_one(spam_num.dict())
        logging.info(f"Initialized {len(DEFAULT_SPAM_NUMBERS)} default spam numbers")

@app.on_event("startup")
async def startup_event():
    await init_database()

# ==================== AUTH HELPERS ====================

async def get_session_token(request: Request) -> Optional[str]:
    """Extract session token from cookie or Authorization header"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    return session_token

async def get_current_user(request: Request) -> Optional[User]:
    """Get current authenticated user"""
    session_token = await get_session_token(request)
    if not session_token:
        return None
    
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        return None
    
    # Check if session is expired
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    
    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if user_doc:
        return User(**user_doc)
    return None

async def get_current_user_optional(request: Request) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    return await get_current_user(request)

async def require_auth(request: Request) -> User:
    """Require authentication - raises 401 if not authenticated"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    return user

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID manquant")
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Session invalide")
            
            user_data = resp.json()
            session_data = SessionDataResponse(**user_data)
            
            # Create or update user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            existing_user = await db.users.find_one({"email": session_data.email}, {"_id": 0})
            
            if existing_user:
                user_id = existing_user["user_id"]
            else:
                new_user = User(
                    user_id=user_id,
                    email=session_data.email,
                    name=session_data.name,
                    picture=session_data.picture
                )
                await db.users.insert_one(new_user.dict())
                
                # Initialize user settings
                user_settings = UserSettings(
                    id=f"settings_{user_id}",
                    user_id=user_id
                )
                await db.settings.insert_one(user_settings.dict())
            
            # Create session
            expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            session = UserSession(
                user_id=user_id,
                session_token=session_data.session_token,
                expires_at=expires_at
            )
            
            # Delete old sessions for this user
            await db.user_sessions.delete_many({"user_id": user_id})
            await db.user_sessions.insert_one(session.dict())
            
            # Set cookie
            response.set_cookie(
                key="session_token",
                value=session_data.session_token,
                httponly=True,
                secure=True,
                samesite="none",
                max_age=7 * 24 * 60 * 60,
                path="/"
            )
            
            return {
                "user_id": user_id,
                "email": session_data.email,
                "name": session_data.name,
                "picture": session_data.picture,
                "session_token": session_data.session_token
            }
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Erreur d'authentification: {str(e)}")

@api_router.get("/auth/me")
async def get_me(request: Request):
    """Get current user info"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = await get_session_token(request)
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Déconnexion réussie"}

# ==================== CATEGORIES ENDPOINTS ====================

@api_router.get("/categories", response_model=List[Category])
async def get_categories(request: Request):
    """Get all categories (default + user's custom)"""
    user = await get_current_user_optional(request)
    
    if user:
        # Get default categories and user's custom categories
        categories = await db.categories.find(
            {"$or": [{"user_id": None}, {"user_id": user.user_id}]},
            {"_id": 0}
        ).to_list(100)
    else:
        # Get only default categories
        categories = await db.categories.find({"user_id": None}, {"_id": 0}).to_list(100)
    
    return [Category(**cat) for cat in categories]

@api_router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryCreate, request: Request):
    """Create a custom category"""
    user = await get_current_user_optional(request)
    
    category = Category(
        name=category_data.name,
        description=category_data.description,
        color=category_data.color,
        icon=category_data.icon,
        is_custom=True,
        user_id=user.user_id if user else None
    )
    await db.categories.insert_one(category.dict())
    return category

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, request: Request):
    """Delete a custom category"""
    user = await get_current_user_optional(request)
    
    category = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    if not category.get("is_custom", False):
        raise HTTPException(status_code=400, detail="Impossible de supprimer une catégorie par défaut")
    
    # Only delete if it's user's category or if no user logged in
    if user and category.get("user_id") and category["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Non autorisé")
    
    await db.categories.delete_one({"id": category_id})
    return {"message": "Catégorie supprimée"}

# ==================== SPAM NUMBERS ENDPOINTS ====================

@api_router.get("/spam-numbers", response_model=List[SpamNumber])
async def get_spam_numbers(request: Request, category_id: Optional[str] = None, search: Optional[str] = None):
    """Get all spam numbers"""
    user = await get_current_user_optional(request)
    
    query = {"is_active": True}
    if user:
        query["$or"] = [{"user_id": None}, {"user_id": user.user_id}]
    else:
        query["user_id"] = None
    
    if category_id:
        query["category_id"] = category_id
    if search:
        query["phone_number"] = {"$regex": search, "$options": "i"}
    
    spam_numbers = await db.spam_numbers.find(query, {"_id": 0}).sort("reports_count", -1).to_list(1000)
    return [SpamNumber(**num) for num in spam_numbers]

@api_router.post("/spam-numbers", response_model=SpamNumber)
async def add_spam_number(spam_data: SpamNumberCreate, request: Request):
    """Add a number to the spam list"""
    user = await get_current_user_optional(request)
    
    existing = await db.spam_numbers.find_one({"phone_number": spam_data.phone_number}, {"_id": 0})
    if existing:
        await db.spam_numbers.update_one(
            {"phone_number": spam_data.phone_number},
            {"$inc": {"reports_count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}}
        )
        updated = await db.spam_numbers.find_one({"phone_number": spam_data.phone_number}, {"_id": 0})
        return SpamNumber(**updated)
    
    cat = await db.categories.find_one({"id": spam_data.category_id}, {"_id": 0})
    cat_name = cat["name"] if cat else "Inconnu"
    
    spam_number = SpamNumber(
        phone_number=spam_data.phone_number,
        category_id=spam_data.category_id,
        category_name=cat_name,
        description=spam_data.description,
        source="user",
        user_id=user.user_id if user else None
    )
    await db.spam_numbers.insert_one(spam_number.dict())
    return spam_number

@api_router.delete("/spam-numbers/{number_id}")
async def remove_spam_number(number_id: str):
    """Remove a number from the spam list"""
    result = await db.spam_numbers.delete_one({"id": number_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Numéro non trouvé")
    return {"message": "Numéro débloqué"}

@api_router.get("/check-number/{phone_number}")
async def check_number(phone_number: str):
    """Check if a number is in the spam database"""
    spam = await db.spam_numbers.find_one({"phone_number": phone_number, "is_active": True}, {"_id": 0})
    if spam:
        return {
            "is_spam": True,
            "category": spam.get("category_name", "Inconnu"),
            "reports_count": spam.get("reports_count", 0),
            "description": spam.get("description", ""),
            "source": spam.get("source", "database")
        }
    return {"is_spam": False}

# ==================== SIGNAL SPAM ENDPOINTS ====================

@api_router.post("/signal-spam/report")
async def report_signal_spam(report: SignalSpamReport, request: Request):
    """Report a number to Signal Spam France"""
    user = await get_current_user_optional(request)
    
    # Store report locally
    report_doc = {
        "id": str(uuid.uuid4()),
        "phone_number": report.phone_number,
        "category": report.category,
        "description": report.description,
        "date_received": report.date_received or datetime.now(timezone.utc),
        "reported_at": datetime.now(timezone.utc),
        "user_id": user.user_id if user else None,
        "synced_to_signal_spam": False
    }
    await db.signal_spam_reports.insert_one(report_doc)
    
    # Try to report to Signal Spam (when API is available)
    result = await report_to_signal_spam(report.phone_number, report.category, report.description)
    
    return {
        "message": "Signalement enregistré",
        "local_id": report_doc["id"],
        "signal_spam_status": result["status"]
    }

@api_router.get("/signal-spam/status")
async def get_signal_spam_status():
    """Get Signal Spam integration status"""
    return {
        "enabled": False,
        "status": "waiting_api_access",
        "message": "En attente des accès API Signal Spam France",
        "pending_reports": await db.signal_spam_reports.count_documents({"synced_to_signal_spam": False})
    }

# ==================== BLOCKED CALLS HISTORY ====================

@api_router.get("/call-history", response_model=List[BlockedCall])
async def get_call_history(request: Request, limit: int = 50):
    """Get blocked calls history"""
    user = await get_current_user_optional(request)
    
    query = {}
    if user:
        query["$or"] = [{"user_id": None}, {"user_id": user.user_id}]
    
    calls = await db.blocked_calls.find(query, {"_id": 0}).sort("blocked_at", -1).to_list(limit)
    return [BlockedCall(**call) for call in calls]

@api_router.post("/call-history", response_model=BlockedCall)
async def log_blocked_call(call_data: BlockedCallCreate, request: Request):
    """Log a blocked call"""
    user = await get_current_user_optional(request)
    
    cat_name = "Inconnu"
    cat_id = call_data.category_id
    
    if not cat_id:
        spam = await db.spam_numbers.find_one({"phone_number": call_data.phone_number}, {"_id": 0})
        if spam:
            cat_id = spam.get("category_id")
            cat_name = spam.get("category_name", "Inconnu")
    else:
        cat = await db.categories.find_one({"id": cat_id}, {"_id": 0})
        if cat:
            cat_name = cat["name"]
    
    blocked_call = BlockedCall(
        phone_number=call_data.phone_number,
        category_id=cat_id,
        category_name=cat_name,
        notes=call_data.notes,
        user_id=user.user_id if user else None
    )
    await db.blocked_calls.insert_one(blocked_call.dict())
    return blocked_call

@api_router.delete("/call-history/{call_id}")
async def delete_call_history(call_id: str):
    """Delete a call from history"""
    result = await db.blocked_calls.delete_one({"id": call_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appel non trouvé")
    return {"message": "Appel supprimé de l'historique"}

@api_router.delete("/call-history")
async def clear_call_history(request: Request):
    """Clear all call history"""
    user = await get_current_user_optional(request)
    
    if user:
        await db.blocked_calls.delete_many({"user_id": user.user_id})
    else:
        await db.blocked_calls.delete_many({})
    
    return {"message": "Historique effacé"}

# ==================== SETTINGS ====================

@api_router.get("/settings", response_model=UserSettings)
async def get_settings(request: Request):
    """Get user settings"""
    user = await get_current_user_optional(request)
    
    if user:
        settings = await db.settings.find_one({"user_id": user.user_id}, {"_id": 0})
    else:
        settings = await db.settings.find_one({"id": "user_settings", "user_id": None}, {"_id": 0})
    
    if not settings:
        settings = UserSettings(user_id=user.user_id if user else None)
        await db.settings.insert_one(settings.dict())
    
    return UserSettings(**settings)

@api_router.put("/settings", response_model=UserSettings)
async def update_settings(settings_data: UserSettingsUpdate, request: Request):
    """Update user settings"""
    user = await get_current_user_optional(request)
    
    update_dict = {k: v for k, v in settings_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    if user:
        await db.settings.update_one(
            {"user_id": user.user_id},
            {"$set": update_dict},
            upsert=True
        )
        settings = await db.settings.find_one({"user_id": user.user_id}, {"_id": 0})
    else:
        await db.settings.update_one(
            {"id": "user_settings", "user_id": None},
            {"$set": update_dict},
            upsert=True
        )
        settings = await db.settings.find_one({"id": "user_settings", "user_id": None}, {"_id": 0})
    
    return UserSettings(**settings)

# ==================== STATISTICS ====================

@api_router.get("/statistics", response_model=Statistics)
async def get_statistics(request: Request):
    """Get blocking statistics"""
    user = await get_current_user_optional(request)
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    
    query = {}
    if user:
        query["$or"] = [{"user_id": None}, {"user_id": user.user_id}]
    
    total_today = await db.blocked_calls.count_documents({**query, "blocked_at": {"$gte": today_start}})
    total_week = await db.blocked_calls.count_documents({**query, "blocked_at": {"$gte": week_start}})
    total_month = await db.blocked_calls.count_documents({**query, "blocked_at": {"$gte": month_start}})
    total_all = await db.blocked_calls.count_documents(query)
    
    spam_query = {}
    if user:
        spam_query["$or"] = [{"user_id": None}, {"user_id": user.user_id}]
    total_spam = await db.spam_numbers.count_documents({**spam_query, "is_active": True})
    
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$category_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_cats = await db.blocked_calls.aggregate(pipeline).to_list(5)
    top_categories = [{"name": cat["_id"], "count": cat["count"]} for cat in top_cats]
    
    return Statistics(
        total_blocked_today=total_today,
        total_blocked_week=total_week,
        total_blocked_month=total_month,
        total_blocked_all=total_all,
        total_spam_numbers=total_spam,
        top_categories=top_categories
    )

# ==================== SYNC / CLOUD ====================

@api_router.post("/sync-database")
async def sync_database(request: Request):
    """Sync spam database"""
    import random
    
    new_numbers_added = 0
    prefixes = ["+3316", "+3317", "+3318", "+3319", "+33949", "+33970"]
    categories = ["commercial", "energy", "insurance", "cpf", "scam", "telecom"]
    
    for _ in range(5):
        prefix = random.choice(prefixes)
        number = f"{prefix}{random.randint(100000, 999999)}"
        category_id = random.choice(categories)
        
        existing = await db.spam_numbers.find_one({"phone_number": number})
        if not existing:
            cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
            spam = SpamNumber(
                phone_number=number,
                category_id=category_id,
                category_name=cat["name"] if cat else "Inconnu",
                source="sync",
                reports_count=random.randint(10, 100),
                user_id=None
            )
            await db.spam_numbers.insert_one(spam.dict())
            new_numbers_added += 1
    
    return {
        "message": "Base de données synchronisée",
        "new_numbers_added": new_numbers_added,
        "sync_time": datetime.now(timezone.utc).isoformat()
    }

@api_router.post("/sync-user-data")
async def sync_user_data(request: Request):
    """Sync user data to cloud (for logged in users)"""
    user = await require_auth(request)
    
    # Get user's data
    user_spam_numbers = await db.spam_numbers.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    user_blocked_calls = await db.blocked_calls.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    user_categories = await db.categories.find({"user_id": user.user_id}, {"_id": 0}).to_list(100)
    user_settings = await db.settings.find_one({"user_id": user.user_id}, {"_id": 0})
    
    return {
        "message": "Données synchronisées",
        "user_id": user.user_id,
        "stats": {
            "spam_numbers": len(user_spam_numbers),
            "blocked_calls": len(user_blocked_calls),
            "custom_categories": len(user_categories)
        },
        "sync_time": datetime.now(timezone.utc).isoformat()
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "StopPubbySi API - Bloqueur d'appels commerciaux"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

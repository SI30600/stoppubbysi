from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="CallGuard API", description="API pour le blocage d'appels commerciaux")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    color: str = "#FF5722"
    icon: str = "phone-off"
    is_custom: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
    source: str = "database"  # database, user, sync
    reports_count: int = 1
    description: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SpamNumberCreate(BaseModel):
    phone_number: str
    category_id: str
    description: str = ""

class BlockedCall(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone_number: str
    category_id: Optional[str] = None
    category_name: str = "Inconnu"
    blocked_at: datetime = Field(default_factory=datetime.utcnow)
    was_blocked: bool = True
    notes: str = ""

class BlockedCallCreate(BaseModel):
    phone_number: str
    category_id: Optional[str] = None
    notes: str = ""

class UserSettings(BaseModel):
    id: str = "user_settings"
    block_unknown_numbers: bool = False
    notifications_enabled: bool = True
    auto_block_spam: bool = True
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserSettingsUpdate(BaseModel):
    block_unknown_numbers: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    auto_block_spam: Optional[bool] = None

class Statistics(BaseModel):
    total_blocked_today: int = 0
    total_blocked_week: int = 0
    total_blocked_month: int = 0
    total_blocked_all: int = 0
    total_spam_numbers: int = 0
    top_categories: List[dict] = []

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

# French spam numbers database (known spam prefixes and numbers)
DEFAULT_SPAM_NUMBERS = [
    # Energy/Renovation scams
    {"phone_number": "+33162000000", "category_id": "energy", "description": "Démarchage isolation", "reports_count": 150},
    {"phone_number": "+33163000000", "category_id": "energy", "description": "Panneaux solaires", "reports_count": 120},
    {"phone_number": "+33164000000", "category_id": "renovation", "description": "Rénovation énergétique", "reports_count": 200},
    {"phone_number": "+33170000000", "category_id": "commercial", "description": "Centre d'appels commercial", "reports_count": 180},
    # CPF scams
    {"phone_number": "+33949000000", "category_id": "cpf", "description": "Arnaque CPF", "reports_count": 500},
    {"phone_number": "+33948000000", "category_id": "cpf", "description": "Formation CPF frauduleuse", "reports_count": 450},
    # Insurance
    {"phone_number": "+33970000000", "category_id": "insurance", "description": "Démarchage assurance", "reports_count": 90},
    {"phone_number": "+33971000000", "category_id": "insurance", "description": "Mutuelle santé", "reports_count": 85},
    # Telecom
    {"phone_number": "+33980000000", "category_id": "telecom", "description": "Offre box internet", "reports_count": 70},
    {"phone_number": "+33981000000", "category_id": "telecom", "description": "Forfait mobile", "reports_count": 65},
    # Banking
    {"phone_number": "+33185000000", "category_id": "banking", "description": "Crédit consommation", "reports_count": 110},
    {"phone_number": "+33186000000", "category_id": "banking", "description": "Rachat de crédit", "reports_count": 95},
    # Real estate
    {"phone_number": "+33187000000", "category_id": "realestate", "description": "Investissement immobilier", "reports_count": 80},
    # Scams
    {"phone_number": "+33891000000", "category_id": "scam", "description": "Numéro surtaxé suspect", "reports_count": 300},
    {"phone_number": "+33892000000", "category_id": "scam", "description": "Arnaque téléphonique", "reports_count": 280},
    {"phone_number": "+33899000000", "category_id": "scam", "description": "Numéro frauduleux", "reports_count": 350},
    # Survey
    {"phone_number": "+33176000000", "category_id": "survey", "description": "Sondage politique", "reports_count": 40},
    {"phone_number": "+33177000000", "category_id": "survey", "description": "Enquête satisfaction", "reports_count": 35},
    # More commercial
    {"phone_number": "+33178000000", "category_id": "commercial", "description": "Vente à domicile", "reports_count": 60},
    {"phone_number": "+33179000000", "category_id": "commercial", "description": "Télémarketing", "reports_count": 55},
]

# ==================== INITIALIZATION ====================

async def init_database():
    """Initialize database with default categories and spam numbers"""
    # Initialize categories
    existing_categories = await db.categories.count_documents({})
    if existing_categories == 0:
        for cat in DEFAULT_CATEGORIES:
            category = Category(**cat, is_custom=False)
            await db.categories.insert_one(category.dict())
        logging.info(f"Initialized {len(DEFAULT_CATEGORIES)} default categories")
    
    # Initialize spam numbers
    existing_spam = await db.spam_numbers.count_documents({})
    if existing_spam == 0:
        for spam in DEFAULT_SPAM_NUMBERS:
            # Get category name
            cat = await db.categories.find_one({"id": spam["category_id"]})
            cat_name = cat["name"] if cat else "Inconnu"
            spam_num = SpamNumber(
                phone_number=spam["phone_number"],
                category_id=spam["category_id"],
                category_name=cat_name,
                description=spam.get("description", ""),
                reports_count=spam.get("reports_count", 1),
                source="database"
            )
            await db.spam_numbers.insert_one(spam_num.dict())
        logging.info(f"Initialized {len(DEFAULT_SPAM_NUMBERS)} default spam numbers")
    
    # Initialize settings
    existing_settings = await db.settings.find_one({"id": "user_settings"})
    if not existing_settings:
        settings = UserSettings()
        await db.settings.insert_one(settings.dict())
        logging.info("Initialized default settings")

@app.on_event("startup")
async def startup_event():
    await init_database()

# ==================== CATEGORIES ENDPOINTS ====================

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    """Get all categories"""
    categories = await db.categories.find().to_list(100)
    return [Category(**cat) for cat in categories]

@api_router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryCreate):
    """Create a custom category"""
    category = Category(
        name=category_data.name,
        description=category_data.description,
        color=category_data.color,
        icon=category_data.icon,
        is_custom=True
    )
    await db.categories.insert_one(category.dict())
    return category

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    """Delete a custom category"""
    category = await db.categories.find_one({"id": category_id})
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    if not category.get("is_custom", False):
        raise HTTPException(status_code=400, detail="Impossible de supprimer une catégorie par défaut")
    await db.categories.delete_one({"id": category_id})
    return {"message": "Catégorie supprimée"}

# ==================== SPAM NUMBERS ENDPOINTS ====================

@api_router.get("/spam-numbers", response_model=List[SpamNumber])
async def get_spam_numbers(category_id: Optional[str] = None, search: Optional[str] = None):
    """Get all spam numbers, optionally filtered by category or search term"""
    query = {"is_active": True}
    if category_id:
        query["category_id"] = category_id
    if search:
        query["phone_number"] = {"$regex": search, "$options": "i"}
    
    spam_numbers = await db.spam_numbers.find(query).sort("reports_count", -1).to_list(1000)
    return [SpamNumber(**num) for num in spam_numbers]

@api_router.post("/spam-numbers", response_model=SpamNumber)
async def add_spam_number(spam_data: SpamNumberCreate):
    """Add a number to the spam list"""
    # Check if already exists
    existing = await db.spam_numbers.find_one({"phone_number": spam_data.phone_number})
    if existing:
        # Increment reports count
        await db.spam_numbers.update_one(
            {"phone_number": spam_data.phone_number},
            {"$inc": {"reports_count": 1}, "$set": {"updated_at": datetime.utcnow()}}
        )
        updated = await db.spam_numbers.find_one({"phone_number": spam_data.phone_number})
        return SpamNumber(**updated)
    
    # Get category name
    cat = await db.categories.find_one({"id": spam_data.category_id})
    cat_name = cat["name"] if cat else "Inconnu"
    
    spam_number = SpamNumber(
        phone_number=spam_data.phone_number,
        category_id=spam_data.category_id,
        category_name=cat_name,
        description=spam_data.description,
        source="user"
    )
    await db.spam_numbers.insert_one(spam_number.dict())
    return spam_number

@api_router.delete("/spam-numbers/{number_id}")
async def remove_spam_number(number_id: str):
    """Remove a number from the spam list (unblock)"""
    result = await db.spam_numbers.delete_one({"id": number_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Numéro non trouvé")
    return {"message": "Numéro débloqué"}

@api_router.get("/check-number/{phone_number}")
async def check_number(phone_number: str):
    """Check if a number is in the spam database"""
    spam = await db.spam_numbers.find_one({"phone_number": phone_number, "is_active": True})
    if spam:
        return {
            "is_spam": True,
            "category": spam.get("category_name", "Inconnu"),
            "reports_count": spam.get("reports_count", 0),
            "description": spam.get("description", "")
        }
    return {"is_spam": False}

# ==================== BLOCKED CALLS HISTORY ====================

@api_router.get("/call-history", response_model=List[BlockedCall])
async def get_call_history(limit: int = 50):
    """Get blocked calls history"""
    calls = await db.blocked_calls.find().sort("blocked_at", -1).to_list(limit)
    return [BlockedCall(**call) for call in calls]

@api_router.post("/call-history", response_model=BlockedCall)
async def log_blocked_call(call_data: BlockedCallCreate):
    """Log a blocked call"""
    # Try to find category info
    cat_name = "Inconnu"
    cat_id = call_data.category_id
    
    if not cat_id:
        # Check if number is in spam database
        spam = await db.spam_numbers.find_one({"phone_number": call_data.phone_number})
        if spam:
            cat_id = spam.get("category_id")
            cat_name = spam.get("category_name", "Inconnu")
    else:
        cat = await db.categories.find_one({"id": cat_id})
        if cat:
            cat_name = cat["name"]
    
    blocked_call = BlockedCall(
        phone_number=call_data.phone_number,
        category_id=cat_id,
        category_name=cat_name,
        notes=call_data.notes
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
async def clear_call_history():
    """Clear all call history"""
    await db.blocked_calls.delete_many({})
    return {"message": "Historique effacé"}

# ==================== SETTINGS ====================

@api_router.get("/settings", response_model=UserSettings)
async def get_settings():
    """Get user settings"""
    settings = await db.settings.find_one({"id": "user_settings"})
    if not settings:
        settings = UserSettings()
        await db.settings.insert_one(settings.dict())
    return UserSettings(**settings)

@api_router.put("/settings", response_model=UserSettings)
async def update_settings(settings_data: UserSettingsUpdate):
    """Update user settings"""
    update_dict = {k: v for k, v in settings_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.settings.update_one(
        {"id": "user_settings"},
        {"$set": update_dict},
        upsert=True
    )
    settings = await db.settings.find_one({"id": "user_settings"})
    return UserSettings(**settings)

# ==================== STATISTICS ====================

@api_router.get("/statistics", response_model=Statistics)
async def get_statistics():
    """Get blocking statistics"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    
    total_today = await db.blocked_calls.count_documents({"blocked_at": {"$gte": today_start}})
    total_week = await db.blocked_calls.count_documents({"blocked_at": {"$gte": week_start}})
    total_month = await db.blocked_calls.count_documents({"blocked_at": {"$gte": month_start}})
    total_all = await db.blocked_calls.count_documents({})
    total_spam = await db.spam_numbers.count_documents({"is_active": True})
    
    # Get top categories
    pipeline = [
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

# ==================== SYNC DATABASE ====================

@api_router.post("/sync-database")
async def sync_database():
    """Sync spam database with latest data (simulated)"""
    # In a real app, this would fetch from external APIs
    # For now, we'll add some new random numbers
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
            cat = await db.categories.find_one({"id": category_id})
            spam = SpamNumber(
                phone_number=number,
                category_id=category_id,
                category_name=cat["name"] if cat else "Inconnu",
                source="sync",
                reports_count=random.randint(10, 100)
            )
            await db.spam_numbers.insert_one(spam.dict())
            new_numbers_added += 1
    
    return {
        "message": "Base de données synchronisée",
        "new_numbers_added": new_numbers_added,
        "sync_time": datetime.utcnow().isoformat()
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "CallGuard API - Bloqueur d'appels commerciaux"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

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

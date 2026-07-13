"""
Simplified Supabase database client for user authentication
Uses direct HTTP requests to bypass library compatibility issues
"""
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Optional, Dict, Any, List
import logging
from config import settings
from core.security import get_password_hash, verify_password
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)


_session = requests.Session()
_adapter = HTTPAdapter(
    pool_connections=20,
    pool_maxsize=50,
    max_retries=Retry(total=2, backoff_factor=0.3, status_forcelist=[502, 503, 504]),
)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


class SupabaseREST:
    """Supabase REST API helper for database operations"""

    @staticmethod
    def _get_headers():
        """Get headers for Supabase requests"""
        auth_key = settings.supabase_service_key if settings.supabase_service_key and settings.supabase_service_key != "SERVICE_ROLE_KEY_HERE" else settings.supabase_key
        return {
            "apikey": auth_key,
            "Authorization": f"Bearer {auth_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    @staticmethod
    def select(table: str, columns: str = "*", filters: Dict[str, Any] = None,
               order: str = None, limit: int = None, offset: int = None) -> List[Dict]:
        """
        Select data from a table
        filters: dict of column=value pairs (for eq filter) or special filters like {"column.gt": value}
        """
        try:
            url = f"{settings.supabase_url}/rest/v1/{table}?select={columns}"

            if filters:
                from urllib.parse import quote
                for key, value in filters.items():
                    encoded = quote(str(value), safe='')
                    if '.' in key:
                        col, op = key.rsplit('.', 1)
                        url += f"&{col}={op}.{encoded}"
                    else:
                        url += f"&{key}=eq.{encoded}"

            if order:
                url += f"&order={order}"

            if limit:
                url += f"&limit={limit}"

            if offset:
                url += f"&offset={offset}"

            response = _session.get(url, headers=SupabaseREST._get_headers(), timeout=15)

            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Supabase SELECT error: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            logger.error(f"Supabase SELECT exception: {e}")
            return []

    @staticmethod
    def select_one(table: str, columns: str = "*", filters: Dict[str, Any] = None) -> Optional[Dict]:
        """Select single row from a table"""
        results = SupabaseREST.select(table, columns, filters, limit=1)
        return results[0] if results else None

    @staticmethod
    def select_in(
        table: str,
        column: str,
        values: List[Any],
        select_cols: str = "*",
        extra_filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict]:
        """Fetch every row whose `column` is in `values` — one HTTP call.

        Replaces the common N+1 pattern:
            for v in values:
                SupabaseREST.select_one(table, ..., {column: v})

        Returns [] for an empty input rather than firing a broken
        `?column=in.()` request that PostgREST 400s on.
        """
        if not values:
            return []
        unique = list({str(v) for v in values if v is not None})
        if not unique:
            return []
        in_list = ",".join(unique)
        try:
            url = (
                f"{settings.supabase_url}/rest/v1/{table}"
                f"?select={select_cols}&{column}=in.({in_list})"
            )
            if extra_filters:
                for key, value in extra_filters.items():
                    if "." in key:
                        col, op = key.rsplit(".", 1)
                        url += f"&{col}={op}.{value}"
                    else:
                        url += f"&{key}=eq.{value}"
            response = _session.get(url, headers=SupabaseREST._get_headers(), timeout=20)
            if response.status_code == 200:
                return response.json()
            logger.error(f"Supabase SELECT IN error: {response.status_code} - {response.text}")
            return []
        except Exception as e:
            logger.error(f"Supabase SELECT IN exception: {e}")
            return []

    @staticmethod
    def insert(table: str, data: Dict[str, Any]) -> Optional[Dict]:
        """Insert data into a table"""
        try:
            url = f"{settings.supabase_url}/rest/v1/{table}"
            response = _session.post(url, headers=SupabaseREST._get_headers(), json=data, timeout=15)

            if response.status_code in [200, 201]:
                result = response.json()
                return result[0] if isinstance(result, list) and result else result
            else:
                logger.error(f"Supabase INSERT error: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"Supabase INSERT exception: {e}")
            return None

    @staticmethod
    def update(table: str, data: Dict[str, Any], filters: Dict[str, Any]) -> Optional[Dict]:
        """Update data in a table"""
        try:
            url = f"{settings.supabase_url}/rest/v1/{table}?"

            for key, value in filters.items():
                if '.' in key:
                    col, op = key.rsplit('.', 1)
                    url += f"&{col}={op}.{value}"
                else:
                    url += f"&{key}=eq.{value}"

            response = _session.patch(url, headers=SupabaseREST._get_headers(), json=data, timeout=15)

            if response.status_code in [200, 201, 204]:
                if response.text:
                    result = response.json()
                    return result[0] if isinstance(result, list) and result else result
                return data
            else:
                logger.error(f"Supabase UPDATE error: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"Supabase UPDATE exception: {e}")
            return None

    @staticmethod
    def delete(table: str, filters: Dict[str, Any]) -> bool:
        """Delete data from a table"""
        try:
            url = f"{settings.supabase_url}/rest/v1/{table}?"

            for key, value in filters.items():
                url += f"&{key}=eq.{value}"

            response = _session.delete(url, headers=SupabaseREST._get_headers(), timeout=15)
            return response.status_code in [200, 204]
        except Exception as e:
            logger.error(f"Supabase DELETE exception: {e}")
            return False

    @staticmethod
    def count(table: str, filters: Dict[str, Any] = None) -> int:
        """Count rows in a table"""
        try:
            url = f"{settings.supabase_url}/rest/v1/{table}?select=count"
            headers = SupabaseREST._get_headers()
            headers["Prefer"] = "count=exact"

            if filters:
                for key, value in filters.items():
                    if '.' in key:
                        col, op = key.rsplit('.', 1)
                        url += f"&{col}={op}.{value}"
                    else:
                        url += f"&{key}=eq.{value}"

            response = _session.head(url, headers=headers, timeout=15)

            if response.status_code == 200:
                content_range = response.headers.get('content-range', '*/0')
                total = content_range.split('/')[-1]
                return int(total) if total != '*' else 0
            return 0
        except Exception as e:
            logger.error(f"Supabase COUNT exception: {e}")
            return 0

    @staticmethod
    def search(table: str, column: str, query: str, columns: str = "*",
               limit: int = 20, offset: int = 0) -> List[Dict]:
        """Search with ilike filter"""
        try:
            url = f"{settings.supabase_url}/rest/v1/{table}?select={columns}&{column}=ilike.*{query}*&limit={limit}&offset={offset}"
            response = _session.get(url, headers=SupabaseREST._get_headers(), timeout=15)

            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            logger.error(f"Supabase SEARCH exception: {e}")
            return []

class SupabaseClient:
    """Supabase client for storage operations"""
    
    def __init__(self):
        self.url = settings.supabase_url
        self.key = settings.supabase_service_key or settings.supabase_key
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json"
        }
    
    def storage(self):
        """Return storage interface"""
        return SupabaseStorage(self)

class SupabaseStorage:
    """Supabase storage interface"""
    
    def __init__(self, client: SupabaseClient):
        self.client = client
    
    def from_(self, bucket_name: str):
        """Select storage bucket"""
        return SupabaseBucket(self.client, bucket_name)

class SupabaseBucket:
    """Supabase storage bucket interface"""
    
    def __init__(self, client: SupabaseClient, bucket_name: str):
        self.client = client
        self.bucket_name = bucket_name
    
    def upload(self, path: str, file_data: bytes, file_options: Optional[Dict] = None):
        """Upload file to storage bucket"""
        try:
            url = f"{self.client.url}/storage/v1/object/{self.bucket_name}/{path}"
            
            headers = {
                "apikey": self.client.key,
                "Authorization": f"Bearer {self.client.key}",
            }
            
            if file_options and "content_type" in file_options:
                headers["Content-Type"] = file_options["content_type"]
            
            response = _session.post(
                url, 
                data=file_data, 
                headers=headers, 
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                return {
                    "success": True,
                    "path": path,
                    "public_url": f"{self.client.url}/storage/v1/object/public/{self.bucket_name}/{path}"
                }
            else:
                logger.error(f"Upload failed: {response.status_code} - {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            logger.error(f"Upload error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def remove(self, paths: list):
        """Remove files from storage bucket"""
        try:
            url = f"{self.client.url}/storage/v1/object/{self.bucket_name}"
            
            response = _session.delete(
                url,
                json={"prefixes": paths},
                headers=self.client.headers,
                timeout=10
            )
            
            return response.status_code == 200
            
        except Exception as e:
            logger.error(f"Remove error: {str(e)}")
            return False
    
    def get_public_url(self, path: str):
        """Get public URL for file"""
        return f"{self.client.url}/storage/v1/object/public/{self.bucket_name}/{path}"

def get_supabase_client() -> SupabaseClient:
    """Get Supabase client instance"""
    return SupabaseClient()

class SupabaseService:
    
    @staticmethod
    def _get_headers():
        """Get headers for Supabase requests"""
        auth_key = settings.supabase_service_key if settings.supabase_service_key and settings.supabase_service_key != "SERVICE_ROLE_KEY_HERE" else settings.supabase_key
        
        return {
            "apikey": auth_key,
            "Authorization": f"Bearer {auth_key}",
            "Content-Type": "application/json"
        }
    
    @staticmethod
    async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Get user by email from Supabase users table"""
        try:
            url = f"{settings.supabase_url}/rest/v1/users?select=*&email=eq.{email}"
            headers = SupabaseService._get_headers()
            
            response = _session.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                users = response.json()
                if users and len(users) > 0:
                    user = users[0]
                    logger.info(f"✅ Found user in database: {email}")
                    return user
                else:
                    logger.info(f"❌ User not found in database: {email}")
                    return None
            else:
                logger.error(f"❌ Error fetching user {email}: HTTP {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error fetching user {email}: {e}")
            return None
    
    @staticmethod
    async def create_user(email: str, password: str, role: str, first_name: str = None, last_name: str = None) -> Optional[Dict[str, Any]]:
        """Create new user in Supabase users table"""
        try:
            existing_user = await SupabaseService.get_user_by_email(email)
            if existing_user:
                logger.warning(f"❌ User already exists: {email}")
                return None
            
            user_id = str(uuid.uuid4())
            password_hash = get_password_hash(password)
            
            user_data = {
                'id': user_id,
                'email': email,
                'password_hash': password_hash,
                'role': role,
                'is_verified': False,
                'is_active': True,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            url = f"{settings.supabase_url}/rest/v1/users"
            headers = SupabaseService._get_headers()
            
            response = _session.post(url, headers=headers, json=user_data, timeout=10)
            
            logger.info(f"📊 Supabase create user response: Status {response.status_code}, Content: {response.text[:200]}")
            
            if response.status_code == 201:
                try:
                    if response.text and response.text.strip():
                        created_user = response.json()
                        if isinstance(created_user, list) and len(created_user) > 0:
                            created_user = created_user[0]
                    else:
                        logger.info(f"✅ User created successfully (empty response): {email}")
                        created_user = user_data
                    
                    logger.info(f"✅ User created successfully: {email} as {role}")
                    
                    if first_name or last_name:
                        try:
                            profile_data = {
                                'id': str(uuid.uuid4()),
                                'user_id': user_id,
                                'first_name': first_name or '',
                                'last_name': last_name or '',
                                'reputation_score': 0,
                                'created_at': datetime.utcnow().isoformat(),
                                'updated_at': datetime.utcnow().isoformat()
                            }
                            
                            profile_url = f"{settings.supabase_url}/rest/v1/user_profiles"
                            profile_response = _session.post(profile_url, headers=headers, json=profile_data, timeout=10)
                            
                            if profile_response.status_code == 201:
                                logger.info(f"✅ User profile created for: {email}")
                            else:
                                logger.warning(f"⚠️ Profile creation failed for {email}: {profile_response.text}")
                            
                        except Exception as profile_error:
                            logger.warning(f"⚠️ Profile creation failed for {email}: {profile_error}")
                    
                    return created_user
                    
                except ValueError as json_error:
                    logger.info(f"✅ User created successfully (JSON parse error): {email} - {json_error}")
                    return user_data
                    
            else:
                logger.error(f"❌ Failed to create user: {email} - HTTP {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error creating user {email}: {e}")
            return None
    
    @staticmethod
    async def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user with email and password"""
        try:
            user = await SupabaseService.get_user_by_email(email)
            
            if not user:
                logger.warning(f"❌ Authentication failed - user not found: {email}")
                return None
            
            if not user.get('is_active', False):
                logger.warning(f"❌ Authentication failed - user inactive: {email}")
                return None
            
            stored_password_hash = user.get('password_hash', '')
            if not verify_password(password, stored_password_hash):
                logger.warning(f"❌ Authentication failed - wrong password: {email}")
                return None
            
            logger.info(f"✅ Authentication successful: {email} as {user.get('role')}")
            return user
            
        except Exception as e:
            logger.error(f"❌ Error authenticating user {email}: {e}")
            return None
    
    @staticmethod
    async def test_connection() -> bool:
        """Test Supabase connection"""
        try:
            url = f"{settings.supabase_url}/rest/v1/users?select=id&limit=1"
            headers = SupabaseService._get_headers()
            
            response = _session.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                logger.info("✅ Supabase connection test successful")
                return True
            else:
                logger.error(f"❌ Supabase connection test failed: HTTP {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Supabase connection test failed: {e}")
            return False

async def init_supabase():
    """Initialize Supabase connection"""
    success = await SupabaseService.test_connection()
    if success:
        logger.info("🎉 Supabase service initialized successfully")
    else:
        logger.warning("⚠️ Supabase service initialization failed - will use mock auth")
    return success 
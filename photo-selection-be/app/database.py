import os
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, ClientOptions, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SECRET_KEY")
    or os.getenv("SUPABASE_PUBLISHABLE_KEY")
)

# 요청이 무한 대기하지 않도록 타임아웃 설정 (초)
POSTGREST_TIMEOUT = 15


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY/PUBLISHABLE_KEY) must be set in .env"
        )
    options = ClientOptions(postgrest_client_timeout=POSTGREST_TIMEOUT)
    return create_client(SUPABASE_URL, SUPABASE_KEY, options)


supabase: Optional[Client] = None


def init_supabase() -> Client:
    global supabase
    supabase = get_supabase()
    return supabase

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthApiError, AuthInvalidJwtError

from app.database import get_supabase

bearer_scheme = HTTPBearer(auto_error=True)


def get_current_photographer(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UUID:
    """Authorization 헤더의 Supabase JWT를 검증하고 photographer_id를 반환. Supabase Auth API로 검증하므로 JWT_SECRET 불필요."""
    token = credentials.credentials
    client = get_supabase()
    try:
        user_response = client.auth.get_user(token)
    except (AuthApiError, AuthInvalidJwtError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from e
    if not user_response or not user_response.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    auth_user_id = user_response.user.id

    # photographers 테이블: auth_id = Supabase Auth user id
    r = (
        client.table("photographers")
        .select("id")
        .eq("auth_id", auth_user_id)
        .limit(1)
        .execute()
    )
    if not r.data or len(r.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Photographer not found for this account",
        )
    return UUID(r.data[0]["id"])

"""
Smart Template Search endpoint.
Uses OpenAI embeddings + Supabase vector search (pure semantic, no hard filters).
Flow: query → translate to English → embed → search_templates RPC → return results
"""
import os
import json
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


class TemplateSearchRequest(BaseModel):
    query: str


class TemplateSearchResult(BaseModel):
    id: int
    title: str
    summary: str
    file_url: str
    primary_problem: Optional[str] = None
    entity_scope: Optional[str] = None
    species: Optional[str] = None
    status: Optional[str] = None
    urgency: Optional[str] = None
    tone: Optional[str] = None
    donor_action: Optional[str] = None
    tags: List[str] = []
    conditions: List[str] = []
    similarity: float = 0.0


class TemplateSearchResponse(BaseModel):
    success: bool
    count: int
    results: List[TemplateSearchResult]


async def _translate_to_english(query: str) -> str:
    """Translate query to English using GPT-4o-mini for better embedding similarity."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Translate the user's search query to English. "
                            "Return ONLY the translated text, nothing else. "
                            "If already in English, return it as-is."
                        ),
                    },
                    {"role": "user", "content": query},
                ],
                "max_tokens": 100,
                "temperature": 0,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()


async def _create_embedding(text: str) -> List[float]:
    """Create a 1536-dim embedding using text-embedding-3-small."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={"model": "text-embedding-3-small", "input": text},
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]


async def _search_supabase(embedding: List[float], match_count: int = 10) -> List[dict]:
    """Call Supabase RPC search_templates with pure semantic search (no filters)."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/search_templates",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "query_embedding": "[" + ",".join(str(v) for v in embedding) + "]",
                "filter_species": "",
                "filter_problem": "",
                "filter_status": "",
                "filter_urgency": "",
                "filter_scope": "",
                "filter_conditions": None,
                "include_unknown_species": False,
                "match_count": match_count,
            },
        )
        response.raise_for_status()
        return response.json()


def _parse_jsonb(value) -> List[str]:
    """Normalize a jsonb field (list or JSON string) to a plain list of strings."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass
    return []


@router.post("/template-search", response_model=TemplateSearchResponse)
async def search_templates(request: TemplateSearchRequest):
    """
    Search email templates using pure semantic search.
    1. Translate query to English (improves embedding quality for multilingual queries)
    2. Generate embedding with text-embedding-3-small
    3. Call Supabase vector search with no hard filters
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    try:
        # Step 1: translate to English
        english_query = await _translate_to_english(request.query.strip())

        # Step 2: embed
        embedding = await _create_embedding(english_query)

        # Step 3: vector search (no filters — pure semantic)
        raw_results = await _search_supabase(embedding, match_count=10)

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Search service timed out. Please try again.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"External service error: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not connect to external service: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

    results = [
        TemplateSearchResult(
            id=r["id"],
            title=r.get("title", ""),
            summary=r.get("summary") or "",
            file_url=r.get("file_url", ""),
            primary_problem=r.get("primary_problem"),
            entity_scope=r.get("entity_scope"),
            species=r.get("species"),
            status=r.get("status"),
            urgency=r.get("urgency"),
            tone=r.get("tone"),
            donor_action=r.get("donor_action"),
            tags=_parse_jsonb(r.get("tags")),
            conditions=_parse_jsonb(r.get("conditions")),
            similarity=round(float(r.get("similarity", 0)), 4),
        )
        for r in raw_results
        if r.get("id")
    ]

    return TemplateSearchResponse(success=True, count=len(results), results=results)

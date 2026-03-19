"""
utils/ai_categorizer.py - AI Auto-Categorization Simulation
Uses keyword matching and confidence scoring to simulate ML categorization.
In production, replace with OpenAI / Google Cloud NL API.
"""

import re

# Keyword map: category_name -> list of trigger keywords
CATEGORY_KEYWORDS = {
    "Technology": ["software", "hardware", "server", "cloud", "aws", "azure", "hosting", "domain",
                   "laptop", "computer", "tech", "saas", "api", "development", "programming"],
    "Marketing": ["marketing", "advertising", "ad", "campaign", "seo", "social media",
                  "promotion", "branding", "pr", "content", "influencer"],
    "Travel": ["flight", "hotel", "uber", "taxi", "airbnb", "travel", "transport",
               "train", "bus", "fuel", "petrol", "toll", "parking"],
    "Food & Dining": ["food", "restaurant", "lunch", "dinner", "breakfast", "cafe",
                      "coffee", "meal", "catering", "snack", "grocery"],
    "Office Supplies": ["office", "stationery", "paper", "pen", "printer", "supplies",
                        "furniture", "chair", "desk", "equipment"],
    "Consulting": ["consulting", "advisory", "consultant", "strategy", "workshop",
                   "training", "coaching", "mentoring"],
    "Software": ["subscription", "license", "saas", "app", "tool", "platform",
                 "figma", "slack", "notion", "jira", "zoom", "github"],
    "Healthcare": ["medical", "health", "pharmacy", "doctor", "hospital", "clinic",
                   "insurance", "dental", "vision"],
    "Utilities": ["electricity", "water", "internet", "phone", "telecom", "utility",
                  "bill", "gas", "maintenance"],
    "Entertainment": ["entertainment", "event", "ticket", "game", "sport", "music",
                      "movie", "streaming", "netflix", "spotify"],
    "Legal": ["legal", "lawyer", "attorney", "contract", "compliance", "audit",
              "accountant", "tax", "filing"],
    "Design": ["design", "graphic", "ui", "ux", "illustration", "logo", "creative",
               "branding", "photoshop", "figma", "sketch"]
}


def categorize(text: str) -> dict:
    """
    Analyze text and return best matching category with confidence score.
    
    Args:
        text: Invoice description, title, or vendor name
        
    Returns:
        dict with 'category' and 'confidence' (0-100)
    """
    if not text:
        return {"category": "Office Supplies", "confidence": 30.0}

    text_lower = text.lower()
    scores = {}

    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        matched = 0
        for keyword in keywords:
            if keyword in text_lower:
                # Exact word match scores higher
                if re.search(r'\b' + re.escape(keyword) + r'\b', text_lower):
                    score += 10
                else:
                    score += 5
                matched += 1
        if score > 0:
            # Normalize: more unique matches = higher confidence
            scores[category] = min(score + matched * 2, 100)

    if not scores:
        return {"category": "Office Supplies", "confidence": 25.0}

    best_category = max(scores, key=scores.get)
    raw_score = scores[best_category]

    # Scale confidence to realistic range (50-97%)
    confidence = 50 + (raw_score / 100) * 47

    return {
        "category": best_category,
        "confidence": round(confidence, 1)
    }

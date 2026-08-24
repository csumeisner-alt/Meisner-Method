#!/usr/bin/env python3
"""
Top Picks Engine — multi-factor stock screening and ranking.

Scores each stock across 5 dimensions:
  1. Technical (RSI, MACD, moving averages, Bollinger, volume trend)
  2. Fundamental (P/E, revenue growth, margins, debt, ROE)
  3. Momentum (price vs 52-wk range, short/medium-term performance)
  4. Analyst consensus (target price vs current, # analysts, rating)
  5. Risk-adjusted upside (potential return vs historical volatility)

Only stocks scoring >= 65/100 across ALL dimensions are included.
"""
import json
import sys
import math

UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "AVGO", "ORCL",
    # Growth tech
    "CRM", "ADBE", "NOW", "SNOW", "CRWD", "PANW", "ZS", "NET", "DDOG",
    "PLTR", "MDB", "TEAM", "MSTR",
    # Semiconductors
    "AMD", "QCOM", "TXN", "AMAT", "LRCX", "KLAC", "MU", "ON", "MRVL",
    # Finance / Fintech
    "JPM", "V", "MA", "GS", "BLK", "SPGI", "MCO", "AXP", "COF", "COIN",
    # Healthcare / Biotech
    "LLY", "UNH", "ABBV", "MRK", "TMO", "ISRG", "REGN", "GILD", "VRTX", "MRNA",
    # Consumer / Retail
    "COST", "WMT", "HD", "NKE", "SBUX", "MCD", "AMZN",
    # Energy
    "XOM", "CVX", "COP", "OXY", "MPC",
    # Industrial / Defense
    "CAT", "DE", "HON", "LMT", "RTX", "GE", "AXON",
    # ETFs (broad)
    "SPY", "QQQ", "XLK", "XLF",
]

def safe_float(val, default=None):
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default

def safe_int(val, default=0):
    try:
        return int(val)
    except Exception:
        return default

def clean_nan(obj):
    """Recursively replace NaN/inf floats with None so output is valid JSON.
    Python's json.dumps emits bare `NaN`/`Infinity` tokens which JSON.parse rejects."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    return obj

def score_technical(info, history):
    """
    Returns 0-100 technical score.
    Uses RSI, MACD crossover, MA alignment, Bollinger position, volume.
    """
    score = 0
    reasons = []

    closes = list(history["Close"]) if hasattr(history["Close"], "__iter__") else []
    volumes = list(history["Volume"]) if hasattr(history["Volume"], "__iter__") else []

    if len(closes) < 50:
        return 40, ["Insufficient price history"]

    # RSI (14-period)
    gains, losses = [], []
    for i in range(1, 15):
        diff = closes[-i] - closes[-i-1] if i+1 <= len(closes) else 0
        (gains if diff > 0 else losses).append(abs(diff))
    avg_g = sum(gains)/14 if gains else 0
    avg_l = sum(losses)/14 if losses else 1e-9
    rs = avg_g / avg_l
    rsi = 100 - (100 / (1 + rs))

    if 35 <= rsi <= 55:
        score += 25
        reasons.append(f"RSI {rsi:.0f} — ideal recovery zone")
    elif 55 < rsi <= 65:
        score += 18
        reasons.append(f"RSI {rsi:.0f} — healthy momentum")
    elif 25 <= rsi < 35:
        score += 12
        reasons.append(f"RSI {rsi:.0f} — oversold, watch for reversal")
    elif rsi > 75:
        score += 5
        reasons.append(f"RSI {rsi:.0f} — overbought risk")
    else:
        score += 8

    # Moving averages
    ma20 = sum(closes[-20:]) / 20
    ma50 = sum(closes[-50:]) / 50
    ma200 = sum(closes[-200:]) / min(200, len(closes))
    current = closes[-1]

    if current > ma20 > ma50 > ma200:
        score += 25
        reasons.append("Full MA alignment (bullish trend)")
    elif current > ma50 > ma200:
        score += 18
        reasons.append("Price above MA50 & MA200")
    elif current > ma200 and ma50 > ma200:
        score += 12
        reasons.append("Price above MA200, near MA50")
    elif current > ma200:
        score += 8
        reasons.append("Price above long-term average")
    else:
        score += 2

    # MA50 vs MA200 (golden/death cross)
    if ma50 > ma200:
        score += 15
        reasons.append("Golden cross territory (MA50 > MA200)")
    else:
        score += 3

    # Bollinger Bands
    recent_20 = closes[-20:]
    std20 = (sum((x - ma20)**2 for x in recent_20) / 20) ** 0.5
    bb_lower = ma20 - 2 * std20
    bb_upper = ma20 + 2 * std20
    bb_pos = (current - bb_lower) / (bb_upper - bb_lower + 1e-9)

    if 0.2 <= bb_pos <= 0.5:
        score += 20
        reasons.append("Near Bollinger lower-mid — upside room")
    elif 0.5 < bb_pos <= 0.7:
        score += 14
        reasons.append("Bollinger mid-range")
    elif bb_pos < 0.2:
        score += 10
        reasons.append("Near Bollinger lower band")
    else:
        score += 4

    # Volume trend (recent vs average)
    if len(volumes) >= 20:
        avg_vol = sum(volumes[-20:]) / 20
        recent_vol = sum(volumes[-5:]) / 5 if len(volumes) >= 5 else avg_vol
        if recent_vol > avg_vol * 1.2:
            score += 15
            reasons.append("Above-average volume — institutional interest")
        elif recent_vol > avg_vol * 0.9:
            score += 10
            reasons.append("Steady volume")
        else:
            score += 4

    return min(score, 100), reasons

def score_fundamental(info):
    """
    Returns 0-100 fundamental score.
    P/E, revenue growth, margins, ROE, debt/equity, analyst coverage.
    """
    score = 0
    reasons = []

    # P/E ratio
    pe = safe_float(info.get("trailingPE") or info.get("forwardPE"))
    forward_pe = safe_float(info.get("forwardPE"))
    if forward_pe and 5 < forward_pe < 20:
        score += 25
        reasons.append(f"Forward P/E {forward_pe:.1f} — value territory")
    elif forward_pe and 20 <= forward_pe < 35:
        score += 18
        reasons.append(f"Forward P/E {forward_pe:.1f} — reasonable for growth")
    elif pe and 5 < pe < 20:
        score += 20
        reasons.append(f"Trailing P/E {pe:.1f} — undervalued")
    elif (forward_pe or pe or 999) < 50:
        score += 10
    else:
        score += 5

    # Revenue growth (YoY)
    rev_growth = safe_float(info.get("revenueGrowth"))
    if rev_growth and rev_growth > 0.25:
        score += 25
        reasons.append(f"Revenue growth {rev_growth*100:.0f}% YoY — high growth")
    elif rev_growth and rev_growth > 0.10:
        score += 18
        reasons.append(f"Revenue growth {rev_growth*100:.0f}% YoY — solid")
    elif rev_growth and rev_growth > 0:
        score += 10
        reasons.append(f"Revenue growing ({rev_growth*100:.0f}%)")
    else:
        score += 3

    # Profit margin
    margin = safe_float(info.get("profitMargins"))
    if margin and margin > 0.25:
        score += 20
        reasons.append(f"Net margin {margin*100:.0f}% — high quality")
    elif margin and margin > 0.10:
        score += 14
        reasons.append(f"Net margin {margin*100:.0f}% — healthy")
    elif margin and margin > 0:
        score += 7
        reasons.append(f"Profitable ({margin*100:.0f}% margin)")
    else:
        score += 2

    # Return on equity
    roe = safe_float(info.get("returnOnEquity"))
    if roe and roe > 0.25:
        score += 15
        reasons.append(f"ROE {roe*100:.0f}% — strong capital efficiency")
    elif roe and roe > 0.10:
        score += 10
        reasons.append(f"ROE {roe*100:.0f}% — adequate")
    elif roe and roe > 0:
        score += 5
    else:
        score += 2

    # Debt/equity
    de = safe_float(info.get("debtToEquity"))
    if de is not None:
        if de < 0.5:
            score += 15
            reasons.append("Low leverage — strong balance sheet")
        elif de < 1.5:
            score += 10
            reasons.append("Manageable debt levels")
        elif de < 3:
            score += 5
        else:
            score += 1

    return min(score, 100), reasons

def score_momentum(info, history):
    """
    Returns 0-100 momentum score.
    Position vs 52-week range, short & medium-term returns.
    """
    score = 0
    reasons = []
    closes = list(history["Close"]) if hasattr(history["Close"], "__iter__") else []

    if len(closes) < 20:
        return 40, []

    current = closes[-1]

    # 52-week range position
    high52 = safe_float(info.get("fiftyTwoWeekHigh"))
    low52 = safe_float(info.get("fiftyTwoWeekLow"))

    if high52 and low52 and high52 > low52:
        pos = (current - low52) / (high52 - low52)
        if 0.3 <= pos <= 0.65:
            score += 30
            reasons.append(f"Price at {pos*100:.0f}% of 52-wk range — plenty of upside")
        elif 0.65 < pos <= 0.80:
            score += 20
            reasons.append(f"Price at {pos*100:.0f}% of 52-wk range — upper mid-range")
        elif pos < 0.3:
            score += 12
            reasons.append(f"Near 52-week low — potential value play")
        else:
            score += 5
            reasons.append(f"Price near 52-week high")

    # 1-month return
    if len(closes) >= 21:
        ret_1m = (closes[-1] - closes[-21]) / closes[-21]
        if 0.03 <= ret_1m <= 0.12:
            score += 25
            reasons.append(f"1M return +{ret_1m*100:.1f}% — healthy uptrend")
        elif ret_1m > 0.12:
            score += 15
            reasons.append(f"1M return +{ret_1m*100:.1f}% — strong but watch overextension")
        elif -0.05 <= ret_1m < 0.03:
            score += 18
            reasons.append(f"1M return {ret_1m*100:.1f}% — consolidating, potential breakout")
        elif ret_1m < -0.10:
            score += 10
            reasons.append(f"1M return {ret_1m*100:.1f}% — recent weakness, contrarian setup")
        else:
            score += 13

    # 3-month return
    if len(closes) >= 63:
        ret_3m = (closes[-1] - closes[-63]) / closes[-63]
        if 0.05 <= ret_3m <= 0.20:
            score += 25
            reasons.append(f"3M return +{ret_3m*100:.1f}% — sustained uptrend")
        elif ret_3m > 0.20:
            score += 15
        elif -0.05 <= ret_3m < 0.05:
            score += 18
        elif ret_3m < -0.15:
            score += 10
        else:
            score += 12

    # Trend quality (R² of last 20 close prices)
    if len(closes) >= 20:
        y = closes[-20:]
        x = list(range(20))
        n = 20
        sx, sy = sum(x), sum(y)
        sxy = sum(x[i]*y[i] for i in range(n))
        sxx = sum(xi**2 for xi in x)
        slope = (n*sxy - sx*sy) / (n*sxx - sx**2 + 1e-9)
        intercept = (sy - slope*sx) / n
        y_pred = [slope*xi + intercept for xi in x]
        ss_res = sum((y[i]-y_pred[i])**2 for i in range(n))
        ss_tot = sum((y[i]-sy/n)**2 for i in range(n))
        r2 = 1 - ss_res/(ss_tot + 1e-9)
        if r2 > 0.85 and slope > 0:
            score += 20
            reasons.append("Strong upward price trend (high R²)")
        elif r2 > 0.6 and slope > 0:
            score += 12
        elif slope < 0:
            score += 5

    return min(score, 100), reasons

def score_analyst(info):
    """
    Returns 0-100 analyst score.
    Consensus target vs current, number of analysts, rating.
    """
    score = 0
    reasons = []

    current = safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
    target = safe_float(info.get("targetMeanPrice"))
    n_analysts = safe_int(info.get("numberOfAnalystOpinions"))
    rec = info.get("recommendationKey", "").lower()

    if target and current and current > 0:
        upside = (target - current) / current
        if upside > 0.30:
            score += 40
            reasons.append(f"Analyst target ${target:.2f} — {upside*100:.0f}% upside")
        elif upside > 0.15:
            score += 30
            reasons.append(f"Analyst target ${target:.2f} — {upside*100:.0f}% upside")
        elif upside > 0.05:
            score += 18
            reasons.append(f"Analyst target ${target:.2f} — {upside*100:.0f}% upside")
        elif upside > 0:
            score += 10
        else:
            score += 2
            reasons.append(f"Analyst target below current price")
    else:
        score += 10  # no analyst data, neutral

    if n_analysts >= 20:
        score += 25
        reasons.append(f"{n_analysts} analysts covering this stock")
    elif n_analysts >= 10:
        score += 18
        reasons.append(f"{n_analysts} analyst opinions")
    elif n_analysts >= 5:
        score += 12
    elif n_analysts > 0:
        score += 6

    if rec in ("strong_buy", "buy"):
        score += 35
        reasons.append(f"Analyst consensus: {rec.replace('_', ' ').upper()}")
    elif rec == "hold":
        score += 15
    elif rec in ("underperform", "sell", "strong_sell"):
        score += 2

    return min(score, 100), reasons

def compute_price_target(info, history, analyst_score):
    """
    Blended price target:
      40% analyst consensus
      30% technical resistance (recent 3-month high)
      30% fundamental DCF proxy
    """
    closes = list(history["Close"]) if hasattr(history["Close"], "__iter__") else []
    current = safe_float(info.get("currentPrice") or info.get("regularMarketPrice")) or (closes[-1] if closes else None)
    if not current:
        return None, None

    weights, targets = [], []

    # Analyst target (40%)
    analyst_target = safe_float(info.get("targetMeanPrice"))
    if analyst_target and analyst_target > current * 0.5:
        weights.append(0.40)
        targets.append(analyst_target)

    # Technical resistance: 3-month high with small premium (30%)
    if len(closes) >= 63:
        high_3m = max(closes[-63:])
        # If current price is below 3m high, target is that resistance
        # If at/above it, project a 10% continuation
        tech_target = high_3m * 1.08 if current >= high_3m * 0.95 else high_3m
        weights.append(0.30)
        targets.append(tech_target)

    # DCF proxy: apply forward P/E to forward EPS (30%)
    fwd_eps = safe_float(info.get("forwardEps"))
    sector_pe = safe_float(info.get("forwardPE")) or safe_float(info.get("trailingPE"))
    if fwd_eps and fwd_eps > 0:
        # Use a peer-relative PE (cap at 40x for non-speculative)
        pe_mult = min(sector_pe or 25, 40)
        dcf_target = fwd_eps * pe_mult * 1.15  # 15% growth premium
        if dcf_target > current * 0.5:
            weights.append(0.30)
            targets.append(dcf_target)

    if not targets:
        return current * 1.12, 52  # fallback: 12% above current

    total_w = sum(weights)
    blended = sum(t * w for t, w in zip(targets, weights)) / total_w

    # Confidence: blend of analyst coverage and target spread
    spread = abs(blended - current) / current
    base_conf = min(analyst_score, 90)
    # Penalize very wide spreads (too speculative) or zero spread
    if spread > 0.50:
        base_conf *= 0.80
    elif spread < 0.02:
        base_conf *= 0.70

    confidence = int(min(max(base_conf, 45), 94))
    return round(blended, 2), confidence

def fetch_top_picks():
    import yfinance as yf

    seen = set()
    unique_universe = []
    for s in UNIVERSE:
        if s not in seen:
            seen.add(s)
            unique_universe.append(s)

    tickers_obj = yf.Tickers(" ".join(unique_universe))

    results = []

    for symbol in unique_universe:
        try:
            t = tickers_obj.tickers.get(symbol)
            if not t:
                continue

            info = t.info
            # Skip if we can't get basic price info
            current = safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
            if not current or current <= 0:
                continue

            # Get 1-year daily history for technicals
            history = t.history(period="1y")
            if history.empty or len(history) < 30:
                continue

            # Score each dimension
            tech_score, tech_reasons = score_technical(info, history)
            fund_score, fund_reasons = score_fundamental(info)
            mom_score, mom_reasons = score_momentum(info, history)
            analyst_score, analyst_reasons = score_analyst(info)

            # Composite (weighted average)
            composite = (
                tech_score * 0.30 +
                fund_score * 0.25 +
                mom_score * 0.25 +
                analyst_score * 0.20
            )

            # Price target
            price_target, confidence = compute_price_target(info, history, analyst_score)

            # Risk: volatility (annualized std of daily returns)
            closes = [c for c in list(history["Close"]) if safe_float(c) not in (None, 0)]
            daily_rets = [(closes[i]-closes[i-1])/closes[i-1] for i in range(1, len(closes)) if closes[i-1]]
            vol_ann = safe_float(
                (sum(r**2 for r in daily_rets) / len(daily_rets)) ** 0.5 * (252 ** 0.5),
                0,
            ) if daily_rets else 0.0

            # Risk-adjusted composite: penalize high volatility unless upside is proportional
            upside = ((price_target or current) - current) / current if price_target else 0
            risk_adj = composite * (1 - max(0, vol_ann - 0.40) * 0.3)

            results.append({
                "symbol": symbol,
                "name": info.get("shortName") or info.get("longName") or symbol,
                "currentPrice": round(current, 2),
                "priceChange": round(safe_float(info.get("regularMarketChange"), 0), 4),
                "priceChangePercent": round(safe_float(info.get("regularMarketChangePercent"), 0), 4),
                "priceTarget": price_target,
                "confidence": confidence,
                "upside": round(upside * 100, 1),
                "compositeScore": round(composite, 1),
                "riskAdjScore": round(risk_adj, 1),
                "volatility": round(vol_ann * 100, 1),
                "technicalScore": tech_score,
                "fundamentalScore": fund_score,
                "momentumScore": mom_score,
                "analystScore": analyst_score,
                "marketCap": safe_float(info.get("marketCap")),
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
                "targetHighPrice": safe_float(info.get("targetHighPrice")),
                "targetLowPrice": safe_float(info.get("targetLowPrice")),
                "numberOfAnalysts": safe_int(info.get("numberOfAnalystOpinions")),
                "reasons": (tech_reasons + fund_reasons + mom_reasons + analyst_reasons)[:6],
                "volume": safe_int(info.get("regularMarketVolume")),
            })
        except Exception:
            continue

    # Sort by risk-adjusted composite, filter to only genuine opportunities
    results.sort(key=lambda x: x["riskAdjScore"], reverse=True)

    # Only include stocks where upside >= 5% and composite >= 55
    filtered = [r for r in results if r["upside"] >= 5 and r["compositeScore"] >= 55]

    # Take top 12
    top = filtered[:12]

    print(json.dumps(clean_nan(top), allow_nan=False))

if __name__ == "__main__":
    try:
        fetch_top_picks()
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

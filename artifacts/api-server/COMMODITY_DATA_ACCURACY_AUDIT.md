# Commodity Data Accuracy Audit

## Scope

Reviewed the commodity path from Yahoo futures quote and daily history through the API, commodity score/evidence response, detail modal, analysis screen, and chart screen. EIA, USDA, and CFTC evidence remains on its existing provider and validation path.

## Confirmed defects corrected

- **Quote consistency and missing values:** commodity quotes no longer fall back to the last history close or zero-valued change fields when current quote inputs are missing. The API rejects missing, nonpositive, or internally inconsistent price/change/percent snapshots. Change and percent are calculated from the same current and previous prices.
- **Quote timestamp alignment:** commodity analysis includes Yahoo's quote timestamp when the price came from the same regular-market metadata observation. A timestamp is not attached to a price taken from a different fast-info source.
- **Volume semantics:** commodity `volume` uses current-session volume or the latest daily bar; the three-month average is no longer presented as current volume.
- **History order and session alignment:** commodity daily rows are sorted before duplicate exchange sessions are collapsed. The chart applies the same Sunday-to-Monday futures session mapping and keeps the later observation for a duplicate session.
- **Cents-versus-dollars labels:** cents-quoted grains, softs, and livestock retain raw exchange quote values but are labeled in cents in analysis, price alerts, and chart displays. API quote currency uses `USC` for those instruments. USD contract notional conversion remains separate.
- **Stale commodity quote display:** the analysis header suppresses missing, future-dated, or over-age commodity prices and labels their freshness state. The detail modal does not retain a previous commodity price after the latest batch omits it. Other asset-type behavior is unchanged.
- **Continuous-futures identity:** chart responses identify commodity series as continuous futures. The mobile chart says the series is not one tradable contract, provides no unverified month/expiry/settlement claim, and shows the last-bar date and age.
- **AI news grounding:** one provider-generated news summary had been copied into evidence records for every recent source, making the citations look more specific than the evidence. That summary is no longer sent to commodity commentary. The news panel keeps recent source links and dates, and states that article contents are not independently verified or used by scoring/commentary.

## Existing protections retained

- Commodity score inputs require ordered, unique, date-aligned observations and exchange-calendar session validation; stale or incomplete history is unavailable rather than estimated.
- EIA, USDA, and CFTC observations retain their source, units, reporting/publication dates, freshness validation, and provider-failure disclosures.
- Event dates and published values remain separately validated; an article publication date alone is not treated as an upcoming catalyst.
- Commodity intelligence scores remain evidence-based indicators, not return forecasts.

## Data limitations disclosed

- Yahoo futures history is a continuous series. It does not verify the currently tradable delivery month, expiry, settlement, or rollover adjustment. The app does not infer or display those contract details from the continuous ticker.
- If Yahoo's current quote timestamp is absent, the timestamp is shown as unavailable and the current quote is hidden in analysis; dated historical evidence can still be shown separately.
- News results are source links and publication metadata only. Article contents are not independently fetched or validated for AI commentary.

## Unchanged behavior

Changes are gated to supported commodity symbols or commodity UI paths. Stock, ETF, and cryptocurrency quote, chart, and analysis behavior was not intentionally changed.

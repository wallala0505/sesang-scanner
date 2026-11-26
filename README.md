# 세상물정 스캐너 (cloud)
예측시장 + 고신호 헤드라인 + 옵션 체인 -> 텔레그램 채널. GitHub Actions에서 24시간 동작.

| 작업 | 주기 | 파일 |
|---|---|---|
| Kalshi 급변 감시 | 5분 | watcher.mjs |
| 고신호 헤드라인 감시 (Walter Bloomberg/FinancialJuice 텔레 미러, 연준 RSS, Bellingcat, SEC 8-K, 구글뉴스) | 5분 | headlines.mjs, sources.json |
| 데일리 브리핑 (Kalshi + Polymarket) | 매일 08:00 KST | daily.mjs |
| 옵션 체인 데일리 (CBOE, 풋콜비율, IV30, 이상거래, Connors RSI) | 매일 08:00 KST | options.mjs |
| Kalshi vs Polymarket 가격 차이 | 매일 08:00 KST | arb.mjs |
| 가설 반증 리포트 (CRSI 20년 백테스트 + 옵션 특징값 검증) | 일요일 08:00 KST | weekly.mjs |

Secrets: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, GEMINI_KEY, PREDEXON_KEY

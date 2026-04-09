@echo off
REM Fraud Detection Service Deployment Script
REM Step 6: Fraud Detection + BigQuery

echo.
echo ========================================
echo   Fraud Detection Service Deploy
echo   Step 6 of Bank Project
echo ========================================
echo.

SET PROJECT_ID=bank-project-solutions
SET REGION=asia-south1
SET SERVICE_NAME=fraud-detection-service
SET IMAGE_NAME=gcr.io/%PROJECT_ID%/%SERVICE_NAME%
SET KEY_FILE=C:\Users\admin\gcp-keys\bank-project-admin.json

echo 📋 Project: %PROJECT_ID%
echo 📍 Region: %REGION%
echo 🔧 Service: %SERVICE_NAME%
echo.

REM Authenticate
echo 🔐 GCP authenticate అవుతున్నాం...
gcloud auth activate-service-account --key-file="%KEY_FILE%"
gcloud config set project %PROJECT_ID%

REM Enable required APIs
echo.
echo 🔧 Required APIs enable చేస్తున్నాం...
gcloud services enable bigquery.googleapis.com
gcloud services enable bigquerystorage.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

REM BigQuery Pub/Sub subscription create చేయి
echo.
echo 📨 Pub/Sub subscription create చేస్తున్నాం...
gcloud pubsub subscriptions create transaction-events-sub ^
    --topic=transaction-events ^
    --ack-deadline=60 ^
    --message-retention-duration=7d ^
    --project=%PROJECT_ID% 2>nul || echo ℹ️  Subscription already exists

REM Docker build and push
echo.
echo 🏗️  Docker image build చేస్తున్నాం...
cd fraud-detection-service
gcloud builds submit --tag %IMAGE_NAME% .

IF %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker build failed!
    exit /b 1
)

REM Deploy to Cloud Run
echo.
echo 🚀 Cloud Run కి deploy చేస్తున్నాం...
gcloud run deploy %SERVICE_NAME% ^
    --image=%IMAGE_NAME% ^
    --platform=managed ^
    --region=%REGION% ^
    --allow-unauthenticated ^
    --port=8083 ^
    --memory=1Gi ^
    --cpu=1 ^
    --timeout=300 ^
    --min-instances=1 ^
    --max-instances=5 ^
    --set-env-vars="PROJECT_ID=%PROJECT_ID%,BIGQUERY_DATASET=fraud_detection,PUBSUB_SUBSCRIPTION=transaction-events-sub,PUBSUB_FRAUD_TOPIC=fraud-alerts,NODE_ENV=production"

IF %ERRORLEVEL% NEQ 0 (
    echo ❌ Deploy failed!
    exit /b 1
)

REM Service URL get చేయి
echo.
echo 🔗 Service URL తెలుసుకుంటున్నాం...
FOR /F "tokens=*" %%i IN ('gcloud run services describe %SERVICE_NAME% --platform managed --region %REGION% --format "value(status.url)"') DO SET SERVICE_URL=%%i

echo.
echo ========================================
echo   ✅ DEPLOY SUCCESSFUL!
echo ========================================
echo.
echo 🌐 Service URL: %SERVICE_URL%
echo.
echo 📝 Test Commands:
echo.
echo 1. Health Check:
echo    curl %SERVICE_URL%/api/fraud/health
echo.
echo 2. Test Simulation:
echo    curl -X POST %SERVICE_URL%/api/fraud/test/simulate
echo.
echo 3. Manual Analyze:
echo    curl -X POST %SERVICE_URL%/api/fraud/analyze -H "Content-Type: application/json" -d "{\"transaction_id\":\"TXN-001\",\"user_id\":\"USER-001\",\"amount\":250000}"
echo.
echo 4. Analytics Stats:
echo    curl %SERVICE_URL%/api/fraud/analytics/stats
echo.
echo ✅ Step 6 Complete! Next: Step 7 - Vertex AI Chatbot
pause

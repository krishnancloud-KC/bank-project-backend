@echo off
REM IAM Permissions for Fraud Detection Service
REM BigQuery, Pub/Sub, Firestore permissions setup

SET PROJECT_ID=bank-project-solutions
SET KEY_FILE=C:\Users\admin\gcp-keys\bank-project-admin.json

echo 🔐 IAM Permissions Setup for Fraud Detection...
echo.

REM Authenticate
gcloud auth activate-service-account --key-file="%KEY_FILE%"
gcloud config set project %PROJECT_ID%

REM Cloud Run Service Account get చేయి
FOR /F "tokens=*" %%i IN ('gcloud run services describe fraud-detection-service --region asia-south1 --format "value(spec.template.spec.serviceAccountName)"') DO SET SA=%%i

echo 📋 Service Account: %SA%

IF "%SA%"=="" (
    echo ⚠️  Service account not found, using default compute SA
    FOR /F "tokens=*" %%i IN ('gcloud projects describe %PROJECT_ID% --format "value(projectNumber)"') DO SET PROJECT_NUM=%%i
    SET SA=%PROJECT_NUM%-compute@developer.gserviceaccount.com
)

echo.
echo 🔧 BigQuery permissions add చేస్తున్నాం...
gcloud projects add-iam-policy-binding %PROJECT_ID% ^
    --member="serviceAccount:%SA%" ^
    --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding %PROJECT_ID% ^
    --member="serviceAccount:%SA%" ^
    --role="roles/bigquery.jobUser"

echo.
echo 🔧 Pub/Sub permissions add చేస్తున్నాం...
gcloud projects add-iam-policy-binding %PROJECT_ID% ^
    --member="serviceAccount:%SA%" ^
    --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding %PROJECT_ID% ^
    --member="serviceAccount:%SA%" ^
    --role="roles/pubsub.publisher"

echo.
echo 🔧 Firestore permissions add చేస్తున్నాం...
gcloud projects add-iam-policy-binding %PROJECT_ID% ^
    --member="serviceAccount:%SA%" ^
    --role="roles/datastore.user"

echo.
echo ✅ IAM Permissions setup complete!
pause

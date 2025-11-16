pipeline {
    agent any

    environment {
        AWS_REGION       = 'us-east-1'
        AWS_ACCOUNT_ID   = '379322108224'
        CLUSTER_NAME     = 'myapp-cluster'
        ECR_FRONTEND_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-frontend"
        ECR_BACKEND_REPO  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-backend"
    }

    stages {

        // 1️⃣ Checkout Code from GitHub
        stage('Checkout Code') {
            steps {
                git branch: 'main', url: 'https://github.com/anumularoots-svg/pro.git'
            }
        }

        // 2️⃣ Login to AWS ECR
        stage('Login to AWS ECR') {
            steps {
                sh '''
                echo "🔐 Logging in to AWS ECR..."
                aws ecr get-login-password --region ${AWS_REGION} | \
                docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                '''
            }
        }

        // 3️⃣ Build & Push Frontend Docker Image
        stage('Buil

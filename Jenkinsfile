pipeline {
    agent any

    environment {
        AWS_REGION = "ap-south-1"
        AWS_ACCOUNT_ID = "123456789012"
        ECR_REPO = "my-frontend-repo"
        IMAGE_TAG = "latest"
    }

    stages {
        
        stage('Checkout Code') {
            steps {
                echo "Cloning Repository..."
                git branch: 'main', url: 'https://github.com/anumularoots-svg/pro.git'
            }
        }

        stage('Login to AWS ECR') {
            steps {
                echo "Logging in to AWS ECR..."
                sh """
                aws ecr get-login-password --region $AWS_REGION \
                | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
                """
            }
        }

        stage('Build Docker Image') {
            steps {
                echo "Building Docker Image..."
                sh "docker build -t $ECR_REPO ."
            }
        }

        stage('Tag Docker Image') {
            steps {
                echo "🏷 Tagging Docker Image..."
                sh "docker tag $ECR_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
            }
        }

        stage('Push to ECR') {
            steps {
                echo "Pushing Docker Image to ECR..."
                sh "docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
            }
        }
    }

    post {
        success {
            echo "✅ Build & Push to ECR Successful"
        }
        failure {
            echo "❌ Build Failed. Check logs."
        }
    }
}

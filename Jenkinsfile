pipeline {
    agent any

    environment {
        AWS_REGION = 'us-east-1'
        AWS_ACCOUNT_ID = '379322108224'
        ECR_FRONTEND_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-frontend"
        ECR_BACKEND_REPO  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-backend"
        CLUSTER_NAME = 'myapp-cluster'
    }

    stages {

        stage('Checkout Code') {
            steps {
                git branch: 'main', url: 'https://github.com/anumularoots-svg/pro.git'
            }
        }

        stage('Login to AWS ECR') {
            steps {
                sh '''
                aws ecr get-login-password --region ${AWS_REGION} | \
                docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                '''
            }
        }

        stage('Build Frontend Image') {
            steps {
                dir('pro/meeting-frontend') {    // adjust this path if your frontend folder name differs
                    sh '''
                    docker build -t meeting-frontend:latest -f Dockerfile .
                    docker tag meeting-frontend:latest ${ECR_FRONTEND_REPO}:latest
                    docker push ${ECR_FRONTEND_REPO}:latest
                    '''
                }
            }
        }

        stage('Build Backend Image') {
            steps {
                dir('pro/SampleDB_W') {
                    sh '''
                    docker build -t meeting-backend:latest -f Dockerfile .
                    docker tag meeting-backend:latest ${ECR_BACKEND_REPO}:latest
                    docker push ${ECR_BACKEND_REPO}:latest
                    '''
                }
            }
        }

        stage('Update K8s Manifests') {
            steps {
                sh '''
                sed -i "s|image: .*meeting-frontend:.*|image: ${ECR_FRONTEND_REPO}:latest|g" k8s/frontend-deployment.yaml
                sed -i "s|image: .*meeting-backend:.*|image: ${ECR_BACKEND_REPO}:latest|g" k8s/backend-deployment.yaml
                '''
            }
        }

        stage('Deploy to EKS') {
            steps {
                sh '''
                aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}

                kubectl apply -f k8s/mysql-deployment.yaml
                kubectl apply -f k8s/backend-deployment.yaml
                kubectl apply -f k8s/frontend-deployment.yaml
                kubectl apply -f k8s/services.yaml
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Deployment completed successfully to EKS cluster: ${CLUSTER_NAME}"
        }
        failure {
            echo "❌ Deployment failed! Please check logs."
        }
    }
}

pipeline {
    agent any

    environment {
        AWS_REGION        = 'us-east-1'
        AWS_ACCOUNT_ID    = '379322108224'
        CLUSTER_NAME      = 'myapp-cluster'
        ECR_FRONTEND_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-frontend"
        ECR_BACKEND_REPO  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-backend"
    }

    stages {

        // 1️⃣ Checkout source code
        stage('Checkout Code') {
            steps {
                git branch: 'main', url: 'https://github.com/anumularoots-svg/pro.git'
            }
        }

        // 2️⃣ Login to AWS ECR
        stage('Login to AWS ECR') {
            steps {
                sh '''
                echo "Logging in to AWS ECR..."
                aws ecr get-login-password --region ${AWS_REGION} | \
                docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                '''
            }
        }

        // 3️⃣ Build and Push Frontend Image
        stage('Build Frontend Image') {
            steps {
                sh '''
                echo "Building Frontend Docker Image..."
                docker build -t meeting-frontend:latest -f Dockerfile .
                docker tag meeting-frontend:latest ${ECR_FRONTEND_REPO}:latest
                docker push ${ECR_FRONTEND_REPO}:latest
                '''
            }
        }

        // 4️⃣ Build and Push Backend Image
        stage('Build Backend Image') {
            steps {
                dir('SampleDB_W') {
                    sh '''
                    echo "Building Backend Docker Image..."
                    docker build -t meeting-backend:latest -f Dockerfile .
                    docker tag meeting-backend:latest ${ECR_BACKEND_REPO}:latest
                    docker push ${ECR_BACKEND_REPO}:latest
                    '''
                }
            }
        }

        // 5️⃣ Update Kubernetes manifests
        stage('Update K8s Manifests') {
            steps {
                sh '''
                echo "Updating Kubernetes manifests with latest ECR image tags..."
                sed -i "s|image: .*meeting-frontend:.*|image: ${ECR_FRONTEND_REPO}:latest|g" k8s/frontend.yaml
                sed -i "s|image: .*meeting-backend:.*|image: ${ECR_BACKEND_REPO}:latest|g" k8s/backend.yaml
                '''
            }
        }

        // 6️⃣ Verify EKS connection (non-blocking)
        stage('Verify EKS Connection') {
            steps {
                script {
                    try {
                        sh '''
                        echo "Verifying EKS cluster access..."
                        aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}
                        kubectl cluster-info
                        kubectl get nodes
                        '''
                    } catch (err) {
                        echo "Warning: Could not verify EKS cluster nodes. Check if Jenkins IAM role is mapped in aws-auth ConfigMap."
                    }
                }
            }
        }

        // 7️⃣ Deploy to EKS
        stage('Deploy to EKS') {
            steps {
                sh '''
                echo "Deploying application to EKS..."
                aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}
                kubectl apply -f k8s/backend.yaml
                kubectl apply -f k8s/frontend.yaml
                echo "Deployment manifests applied successfully."
                '''
            }
        }
    }

    post {
        success {
            echo "Deployment completed successfully to EKS cluster: ${CLUSTER_NAME}"
        }
        failure {
            echo "Deployment failed! Please check Jenkins logs or AWS IAM/EKS role mappings."
        }
    }
}

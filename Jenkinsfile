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

        stage('Checkout Code') {
            steps {
                git branch: 'main', url: 'https://github.com/anumularoots-svg/pro.git'
            }
        }

        stage('Login to AWS ECR') {
            steps {
                sh '''
                echo "Logging in to AWS ECR..."
                aws ecr get-login-password --region ${AWS_REGION} | \
                docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
                '''
            }
        }

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

        stage('Update K8s Manifests') {
            steps {
                sh '''
                echo "Updating Kubernetes manifests..."
                sed -i "s|image: .*meeting-frontend:.*|image: ${ECR_FRONTEND_REPO}:latest|g" k8s/frontend.yaml
                sed -i "s|image: .*meeting-backend:.*|image: ${ECR_BACKEND_REPO}:latest|g" k8s/backend.yaml
                '''
            }
        }

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
                        echo "Warning: Could not verify cluster nodes. Ensure Jenkins IAM role is added to aws-auth ConfigMap."
                    }
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                script {
                    try {
                        sh '''
                        echo "Deploying manifests to EKS..."
                        aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}
                        kubectl apply -f k8s/backend.yaml --validate=false
                        kubectl apply -f k8s/frontend.yaml --validate=false
                        echo "Deployment manifests applied successfully."
                        '''
                    } catch (err) {
                        error("Kubernetes deployment failed. Check IAM role mapping and cluster access.")
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Deployment completed successfully to EKS cluster: ${CLUSTER_NAME}"
        }
        failure {
            echo "Deployment failed! Check Jenkins IAM role access or Kubernetes RBAC."
        }
    }
}

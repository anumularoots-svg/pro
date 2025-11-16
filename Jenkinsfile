pipeline {
  agent any

  environment {
    AWS_REGION = 'us-east-1'
    AWS_ACCOUNT_ID = '379322108224'   // confirm
    CLUSTER_NAME = 'myapp-cluster'
    ECR_FRONTEND = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-frontend"
    ECR_BACKEND  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/meeting-backend"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Login to ECR') {
      steps {
        sh '''
          aws ecr get-login-password --region ${AWS_REGION} | \
            docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
        '''
      }
    }

    stage('Build & Push Frontend') {
      steps {
          sh '''
            docker build -t meeting-frontend:latest -f Dockerfile .
            docker tag meeting-frontend:latest ${ECR_FRONTEND}:latest
            aws ecr create-repository --repository-name meeting-frontend --region ${AWS_REGION} || true
            docker push ${ECR_FRONTEND}:latest
          '''
        }
      }

    stage('Build & Push Backend') {
      steps {
        dir('SampleDB_W') {
          sh '''
            docker build -t meeting-backend:latest -f Dockerfile .
            docker tag meeting-backend:latest ${ECR_BACKEND}:latest
            aws ecr create-repository --repository-name meeting-backend --region ${AWS_REGION} || true
            docker push ${ECR_BACKEND}:latest
          '''
        }
      }
    }

    stage('Update K8s Manifests') {
      steps {
        sh '''
          sed -i "s|image: .*meeting-frontend:.*|image: ${ECR_FRONTEND}:latest|g" k8s/04-frontend.yaml || true
          sed -i "s|image: .*meeting-backend:.*|image: ${ECR_BACKEND}:latest|g" k8s/03-backend.yaml || true
        '''
      }
    }

    stage('Deploy to EKS') {
      steps {
        script {
          sh '''
            aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}
            kubectl apply -f k8s/00-namespace.yaml
            kubectl apply -f k8s/01-secret.yaml
            kubectl apply -f k8s/02-configmap.yaml
            kubectl apply -f k8s/03-backend.yaml
            kubectl apply -f k8s/04-frontend.yaml
            kubectl apply -f k8s/05-ingress.yaml || true
          '''
        }
      }
    }
  }

  post {
    success { echo "Deployed to EKS ${CLUSTER_NAME}" }
    failure { echo "Deployment failed — check logs" }
  }
}

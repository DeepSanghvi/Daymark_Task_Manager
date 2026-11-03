# Daymark

A small private task manager built with React, Node.js, a REST API, PostgreSQL, and JWT authentication. Each account can only see and change its own tasks.

## Run locally

Requirements: Node.js 20+ and Docker Desktop (or a local PostgreSQL 16 instance).

1. Copy `.env.example` to `.env` and set `JWT_SECRET` to a random value of at least 32 characters.
2. Start PostgreSQL: `docker compose up -d database`.
3. Install packages: `npm install`.
4. Start the app: `npm run dev`.
5. Open the Vite URL shown in the terminal. The API runs on port 3000.

The API creates its tables at startup. For local development, the Docker database is `postgresql://postgres:postgres@localhost:5433/daymark`.

## REST API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Check API and database connectivity |
| POST | `/api/auth/register` | Create account; returns JWT and user |
| POST | `/api/auth/login` | Sign in; returns JWT and user |
| GET | `/api/auth/me` | Get current account |
| GET | `/api/tasks` | List current user's tasks |
| POST | `/api/tasks` | Create a task (`{ "title": "..." }`) |
| PATCH | `/api/tasks/:id` | Update title and/or completed state |
| DELETE | `/api/tasks/:id` | Delete a task |

Send `Authorization: Bearer <token>` to authenticated routes. Passwords are hashed with bcrypt; database queries are parameterized; task operations are scoped to the signed-in user.

## Deploy to AWS

The included Dockerfile builds the React bundle and packages it with the Node API as one container. A simple production setup is AWS App Runner + Amazon RDS for PostgreSQL, with an App Runner VPC connector to the private RDS subnet.

1. Create an RDS PostgreSQL instance in private subnets. Allow inbound port 5433 only from the App Runner VPC connector security group. Enable automated backups and encryption.
2. Build the Docker image and push it to Amazon ECR. For example, build with `docker build -t daymark .`, tag it with your ECR repository URI, then push it.
3. Create an App Runner service from the ECR image. Set port to `3000`; set `DATABASE_URL`, `DATABASE_SSL=true`, `JWT_SECRET`, and optionally `JWT_EXPIRES_IN` as service environment variables. Store database credentials and the signing secret in AWS Secrets Manager and map them to App Runner secrets instead of committing them to source control.
4. Attach the App Runner VPC connector and deploy. App Runner's public endpoint serves the React app and `/api` routes from the same origin. Configure a custom domain and managed TLS certificate if desired.
5. Use `/api/health` as the service health check. Rotate the JWT secret carefully: existing tokens will stop working after rotation.

For production, use a managed database migration job and apply schema changes in a controlled release rather than relying on application startup DDL. The startup initializer here keeps the small starter easy to run locally.

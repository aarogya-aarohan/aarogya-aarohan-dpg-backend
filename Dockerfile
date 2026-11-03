# ==========================
# 1️⃣ Build Stage (Compiling App)
# ==========================
FROM node:22-slim AS builder

# Set working directory
WORKDIR /app

# Install PNPM globally
RUN npm install -g pnpm

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

# Copy package manager files separately to leverage caching
COPY pnpm-lock.yaml package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the entire NX workspace into the container
COPY . .

# Build the NX project inside the container
RUN pnpm nx run arogyam:build

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Remove unnecessary files to reduce image size
RUN rm -rf /root/.cache /app/.git /app/node_modules/.cache /tmp/*

# ==========================
# 2️⃣ Production Runtime Stage (Minimal & Secure)
# ==========================
FROM gcr.io/distroless/nodejs22-debian12 AS runtime

# Set working directory
WORKDIR /app

# Copy only the built application from the builder stage
COPY --from=builder /app/dist/arogyam ./

# Copy only required production dependencies
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Run the built NX app (Entrypoint is "node" by default in distroless images)
CMD ["main.js"]
ARG CREW_IMAGE=europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/crew@sha256:a469ee2b690c0459659d6a61180e7df5294effbccfcee431cd12ad118499579e
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/studio/package.json apps/studio/package.json
RUN pnpm install --frozen-lockfile --filter @vox/studio...
COPY apps/studio/ apps/studio/
RUN pnpm --filter @vox/studio build

FROM python:3.12-slim-bookworm AS api
ARG VOX_STUDIO_REVISION
LABEL org.opencontainers.image.revision=$VOX_STUDIO_REVISION
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/vox-crew
COPY services/agents/pyproject.toml ./
COPY services/agents/src/ ./src/
RUN pip install --no-cache-dir '.[studio]' && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin studio
COPY --from=frontend /build/apps/studio/dist/ /opt/studio-static/
USER 10001:10001
ENTRYPOINT ["python", "-m", "vox_crew.studio_api"]
CMD ["--state", "/var/lib/vox-studio", "--assets", "/opt/studio-static", "--host", "0.0.0.0", "--port", "8780"]

FROM ${CREW_IMAGE} AS worker
ARG VOX_STUDIO_REVISION
LABEL org.opencontainers.image.revision=$VOX_STUDIO_REVISION
USER root
COPY services/agents/pyproject.toml /opt/vox-crew/pyproject.toml
COPY services/agents/src/ /opt/vox-crew/src/
RUN pip install --no-cache-dir 'google-adk[db]==2.7.1' \
    && pip install --no-cache-dir --no-deps --no-build-isolation /opt/vox-crew
USER 10001:10001
ENTRYPOINT ["python", "-m", "vox_crew.studio_worker"]

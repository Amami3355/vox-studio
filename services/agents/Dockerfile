FROM python:3.12-slim-bookworm
ARG VOX_CREW_REVISION
LABEL org.opencontainers.image.revision=$VOX_CREW_REVISION
ENV VOX_CREW_REVISION=$VOX_CREW_REVISION PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/vox-crew
# This build context is services/agents, never the Production repository.
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir '.[agents]' 'google-adk==2.7.1' \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin crew \
    && mkdir -p /var/lib/vox-crew /etc/vox-crew
USER 10001:10001
ENTRYPOINT ["python", "-m", "vox_crew.hosted"]

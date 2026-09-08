FROM python:3.12-slim-bookworm
ARG VOX_CREW_REVISION
LABEL org.opencontainers.image.revision=$VOX_CREW_REVISION
ENV VOX_CREW_REVISION=$VOX_CREW_REVISION PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/vox-crew
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
# This build context is services/agents, never the Production repository.
COPY pyproject.toml ./
RUN python -c "import tomllib,subprocess; p=tomllib.load(open('pyproject.toml','rb')); subprocess.check_call(['pip','install','--no-cache-dir','setuptools>=77',*p['project']['dependencies'],*p['project']['optional-dependencies']['agents'],'google-adk==2.7.1'])"
COPY src/ ./src/
RUN pip install --no-cache-dir --no-deps --no-build-isolation . \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin crew \
    && mkdir -p /var/lib/vox-crew /etc/vox-crew
USER 10001:10001
ENTRYPOINT ["python", "-m", "vox_crew.hosted"]

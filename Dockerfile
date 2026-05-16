FROM oven/bun:1-debian

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    dnsutils \
    file \
    git \
    iproute2 \
    iputils-ping \
    jq \
    netcat-traditional \
    nmap \
    python3 \
    python3-pip \
    ripgrep \
    unzip \
    wget \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash solver

WORKDIR /workspace
USER solver

CMD ["bash", "-lc", "echo WuWeiWeave solver runtime ready && exec bash"]

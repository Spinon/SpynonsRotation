FROM debian:bookworm-slim@sha256:5ae3c39ebd15e229dcedd5cee596b2497182493d41ff162e824ba13fc1b2b867

# Timestamped signed archive, not a moving apt mirror. No host credentials enter this image.
COPY debian.sources /etc/apt/sources.list.d/debian.sources
RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf autoconf-archive automake build-essential ca-certificates cmake curl git \
    libltdl-dev libtool ninja-build pkg-config python3 tar unzip zip

ENV VCPKG_MAX_CONCURRENCY=2 CMAKE_BUILD_PARALLEL_LEVEL=2
WORKDIR /opt/wowless
RUN git init && git remote add origin https://github.com/wowless/wowless.git \
    && git fetch --depth 1 origin e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4 \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4 \
    && git submodule update --init --depth 1 --jobs 2
RUN cmake --preset default
RUN cmake --build --preset default --target wowless_wow wow

LABEL org.opencontainers.image.source="https://github.com/wowless/wowless" \
    org.opencontainers.image.revision="e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4" \
    com.spynon.validation="headless-only-not-retail"
ENTRYPOINT ["/opt/wowless/build/wowless_wow", "run", "-p", "wow"]

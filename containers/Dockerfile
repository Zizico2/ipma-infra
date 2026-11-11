# syntax=docker/dockerfile:1.7
ARG RUST_IMAGE=rust:1.99.1-bookworm
ARG RUNTIME_IMAGE=debian:bookworm-slim
FROM ${RUST_IMAGE} AS build
ARG SERVICE
WORKDIR /src
COPY .sources/${SERVICE}/ ./
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target,sharing=locked \
    cargo build --locked --release -p "${SERVICE}" && \
    install -D "target/release/${SERVICE}" /out/service

FROM ${RUNTIME_IMAGE}
ARG SERVICE
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/Zizico2/${SERVICE}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
# Security packages follow the Debian release; deployed image digests are immutable.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
COPY --from=build /out/service /usr/local/bin/service
COPY --chmod=755 containers/entrypoint.sh /usr/local/bin/entrypoint
ENV IPMA_SERVICE=${SERVICE} PORT=8080
USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint"]

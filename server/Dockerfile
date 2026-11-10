# vfm-server built from source (release images use server/container/Containerfile).
# From the repository root:
#   docker build -f server/Dockerfile -t vfm-server .     (or: podman build …)
#   docker run -d --name vfm-server --restart unless-stopped -p 8787:8787 -v vfm-data:/data vfm-server
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY crates crates
COPY server server
RUN cargo build --release --manifest-path server/Cargo.toml

FROM scratch
COPY --chown=65532:65532 server/container/rootfs/ /
COPY --from=build /src/server/target/release/vfm-server /vfm-server
ENV VFM_CONFIG=/data/vfm-server.toml \
    VFM_CONTAINER=1
USER 65532:65532
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 CMD ["/vfm-server", "healthcheck"]
ENTRYPOINT ["/vfm-server"]
CMD ["run"]

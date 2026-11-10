# Build from the repository root:  docker build -f server/Dockerfile -t vfm-server .
# Run:  docker run -d --restart unless-stopped -p 8787:8787 -v vfm:/data vfm-server
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY crates crates
COPY server server
COPY LICENSE LICENSE
RUN cargo build --release --manifest-path server/Cargo.toml

FROM scratch
COPY --from=build /src/server/target/release/vfm-server /vfm-server
ENV VFM_CONFIG=/data/vfm-server.toml
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/vfm-server"]

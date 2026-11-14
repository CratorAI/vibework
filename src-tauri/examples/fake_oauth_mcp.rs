//! A standalone fake MCP server that signs in with OAuth, for driving a dev
//! window against it (tests only; never shipped). Prints one JSON line with
//! its addresses, then serves until killed.
//!
//! ```sh
//! cargo run --example fake_oauth_mcp -- --access-ttl 20 > /tmp/fake.json
//! ```
//! Admin: `POST <rs>/_admin/expire` (access tokens expire now),
//! `POST <rs>/_admin/revoke` (refresh tokens revoked), `GET <rs>/_admin/log`,
//! `GET <rs>/_admin/stats`. The authorization page approves when fetched with
//! `X-Test-Approve: <subject>`.

#[path = "../tests/fixtures/fake_oauth_mcp.rs"]
mod fake;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let mut opts = fake::FakeOptions::default();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--access-ttl" => {
                opts.access_ttl = args[i + 1].parse().expect("seconds");
                i += 1;
            }
            "--separate-as" => opts.separate_as_origin = true,
            "--no-registration" => opts.registration = false,
            other => panic!("unknown argument {other}"),
        }
        i += 1;
    }
    let server = fake::FakeServer::start(opts).await;
    println!(
        "{}",
        serde_json::json!({"rs": server.rs_origin, "as": server.as_origin, "mcp": server.mcp_url(), "sse": server.sse_url()})
    );
    std::future::pending::<()>().await;
}

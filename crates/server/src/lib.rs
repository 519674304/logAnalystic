// The binary remains the production entry point; this module exposes its router
// factory to black-box integration tests without duplicating route definitions.
#[allow(dead_code)]
#[path = "main.rs"]
pub mod app;

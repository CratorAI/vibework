//! Logging module
//!
//! Handles logging initialization. Logs are written to the console and to
//! local files only; nothing is uploaded.

use std::fs;
use std::path::PathBuf;
use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_subscriber::fmt::format::{FormatEvent, FormatFields};
use tracing_subscriber::registry::LookupSpan;

// ============================================================================
// Logging Initialization
// ============================================================================

/// Custom formatter for Apache-style log format with bracketed fields
struct ApacheFormatter;

impl<S, N> FormatEvent<S, N> for ApacheFormatter
where
    S: tracing::Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &fmt::FmtContext<'_, S, N>,
        mut writer: fmt::format::Writer<'_>,
        event: &tracing::Event<'_>,
    ) -> std::fmt::Result {
        // [Timestamp]
        let now = chrono::Utc::now();
        write!(writer, "[{}] ", now.format("%Y-%m-%d %H:%M:%S%.3f"))?;

        // [Level]
        let level = event.metadata().level();
        write!(writer, "[{:5}] ", level)?;

        // [Target/Module]
        let target = event.metadata().target();
        write!(writer, "[{}] ", target)?;

        // Message
        ctx.field_format().format_fields(writer.by_ref(), event)?;

        writeln!(writer)
    }
}

/// Initialize logging to both console and file
///
/// Sets up Apache-style formatted logging with hourly rotation.
/// Logs are written to both stdout and files in the app's data directory.
pub fn init_logging() {
    // Get the logs directory path
    // This mirrors Tauri's app_data_dir logic
    let logs_dir = get_logs_dir();

    // Create logs directory if it doesn't exist
    if let Err(e) = fs::create_dir_all(&logs_dir) {
        eprintln!("Failed to create logs directory: {}", e);
        // Fall back to console-only logging
        tracing_subscriber::registry()
            .with(
                fmt::layer()
                    .event_format(ApacheFormatter)
            )
            .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
            .init();
        return;
    }

    // Set up file appender (hourly rotation)
    let file_appender = tracing_appender::rolling::hourly(&logs_dir, "vibework.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Initialize with both console and file output (Apache-style format)
    tracing_subscriber::registry()
        .with(
            fmt::layer()
                .with_writer(std::io::stdout)
                .with_ansi(false)  // Disable ANSI for consistent format
                .event_format(ApacheFormatter)
        )
        .with(
            fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false)  // No color codes in files
                .event_format(ApacheFormatter)
        )
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    // Leak the guard to keep the non_blocking writer alive for the app lifetime
    std::mem::forget(_guard);

    info!("Logging initialized. Logs directory: {:?}", logs_dir);
}

/// Get the logs directory path
fn get_logs_dir() -> PathBuf {
    crate::paths::get_app_data_dir().join("logs")
}

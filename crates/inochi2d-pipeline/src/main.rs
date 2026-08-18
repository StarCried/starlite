use std::io::{self, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use inochi2d_pipeline::{build, inspect_file, BuildRequest, Result};
use serde::Serialize;

#[derive(Debug, Parser)]
#[command(
    name = "inochi2d-pipeline",
    version,
    about = "Inspect and deterministically prepare Inochi2D puppets for the web"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Inspect compatibility, parameters, textures, and publication metadata.
    Inspect {
        /// Creator-exported .inp or .inx file.
        #[arg(long)]
        input: PathBuf,
        /// Emit compact JSON instead of indented JSON.
        #[arg(long)]
        compact: bool,
    },
    /// Create a deterministic, content-hashed web bundle without replacing input files.
    Build {
        /// Creator-exported .inp or .inx file.
        #[arg(long)]
        input: PathBuf,
        /// New directory that will receive manifest.json and hashed assets.
        #[arg(long)]
        output_dir: PathBuf,
        /// Optional static fallback image for runtime or network failures.
        #[arg(long)]
        fallback: Option<PathBuf>,
        /// Emit compact JSON instead of indented JSON.
        #[arg(long)]
        compact: bool,
    },
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Command::Inspect { input, compact } => print_json(&inspect_file(&input)?, compact)?,
        Command::Build {
            input,
            output_dir,
            fallback,
            compact,
        } => {
            let manifest = build(&BuildRequest {
                input,
                output_dir,
                fallback,
            })?;
            print_json(&manifest, compact)?;
        }
    }
    Ok(())
}

fn print_json(value: &impl Serialize, compact: bool) -> Result<()> {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    if compact {
        serde_json::to_writer(&mut output, value)?;
    } else {
        serde_json::to_writer_pretty(&mut output, value)?;
    }
    output.write_all(b"\n")?;
    Ok(())
}

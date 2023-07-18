use clap::{builder::ValueParser, Parser};

mod argparse;
mod subcmd;
mod tx_utils;

use argparse::{parse_solana_cli_config_from_path, ConfigWrapper};
use subcmd::{Subcmd, SubcmdExec};

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about,
    long_about = "Public-facing CLI for the unstake solana program"
)]
pub struct Args {
    #[arg(
        long,
        short,
        help = "path to solana CLI config",
        default_value = "",
        value_parser = ValueParser::new(parse_solana_cli_config_from_path)
    )]
    pub config: ConfigWrapper,

    #[arg(
        long,
        help = "only simulate any transactions instead of sending them",
        default_value_t = false
    )]
    pub dry_run: bool,

    #[command(subcommand)]
    pub subcmd: Subcmd,
}

fn main() {
    let args = Args::parse();
    args.subcmd.process_cmd(&args);
}

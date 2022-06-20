use anchor_lang::{prelude::*, solana_program::sysvar::SysvarId};
use anchor_spl::stake::{self, Authorize, Stake, StakeAccount, StakeAuthorize};
use std::collections::HashSet;

use crate::{
    anchor_len::AnchorLen,
    errors::UnstakeError,
    state::{Pool, StakeAccountRecord},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
    ///
    #[account(mut)]
    pub unstaker: Signer<'info>,

    ///
    pub pool: Account<'info, Pool>,

    ///
    /// CHECK: this will be retyped
    #[account(
        seeds = [b"unstake"],  // TODO TBD temp value. Should we just use pool_sol_reserve?
        bump,
    )]
    pub stake_authority: UncheckedAccount<'info>,

    ///
    #[account(
        mut,
        // TODO: constraint -> must be owned by the unstaker
        // TODO: constraint -> must not be locked (Deligated or Initialized)
    )]
    pub stake_account: Account<'info, StakeAccount>,

    /// (PDA)
    #[account(
        init,
        payer = unstaker,
        space = StakeAccountRecord::LEN,
    )]
    pub stake_account_record: Account<'info, StakeAccountRecord>,

    /// Solana native wallet pubkey to receive the unstaked amount
    /// CHECK: payment destination that can accept sol transfer
    pub destination: UncheckedAccount<'info>,

    #[account(
        // TODO: Do we need a check here? A new Error?
        constraint = Clock::check_id(clock.key),
    )]
    /// CHECK: need to check this
    pub clock: UncheckedAccount<'info>,
    pub stake_program: Program<'info, Stake>,
    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;
        let stake_program = &ctx.accounts.stake_program;
        let unstaker = &ctx.accounts.unstaker;
        let stake_authority = &ctx.accounts.stake_authority;
        let stake_account_record = &mut ctx.accounts.stake_account_record;
        let clock = &ctx.accounts.clock;

        let authorized = stake_account
            .authorized()
            .ok_or(UnstakeError::StakeAccountAuthorizedNotRetrievable)?;
        // NOTE: check for withdrawer authority only since withdrawer can change both
        authorized
            .check(&HashSet::from([unstaker.key()]), StakeAuthorize::Withdrawer)
            .map_err(|_| UnstakeError::StakeAccountNotOwned)?;

        // cpi to stake::Authorize
        // TODO: should we derive Clone?
        let authorize_cpi_accs = Authorize {
            stake: stake_account.to_account_info(),
            authorized: unstaker.to_account_info(),
            new_authorized: stake_authority.to_account_info(), // TODO: the program's stake authority
            clock: clock.to_account_info(),
        };
        // authorize stake_authority as Withdrawer
        stake::authorize(
            CpiContext::new(stake_program.to_account_info(), authorize_cpi_accs),
            StakeAuthorize::Withdrawer,
            None, // custodian
        )?;
        // TODO: authorize stake_authority as Staker
        //stake::authorize(
        //    CpiContext::new(stake_program.to_account_info(), authorize_cpi_accs),
        //    StakeAuthorize::Staker,
        //    None, // custodian
        //)?;

        // populate the stake_account_record
        // TODO: confirm if this value need to exclude rent exampt reserve
        //let meta = stake_account.meta();
        //meta.rent_exampt_reserve;
        stake_account_record.lamports_at_creation = stake_account.to_account_info().lamports();

        // TODO: pay-out from lp

        Ok(())
    }
}

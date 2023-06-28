use anchor_lang::{
    prelude::*,
    system_program::{self, transfer, Transfer},
};

use crate::{
    errors::UnstakeError,
    state::{
        FlashAccount, FlashLoanFee, Pool, ProtocolFee, FLASH_ACCOUNT_SEED_SUFFIX,
        FLASH_LOAN_FEE_SEED_SUFFIX, PROTOCOL_FEE_SEED,
    },
};

pub const POOL_ACCOUNT_ACCOUNT_IDX: usize = 1;
/// DO NOT CHANGE THE ORDER OF ACCOUNTS IN THIS STRUCT,
/// ELSE UPDATE `POOL_ACCOUNT_ACCOUNT_IDX`
#[derive(Accounts)]
pub struct RepayFlashLoan<'info> {
    /// system account paying back the flash loan lamports
    #[account(mut)]
    pub repayer: Signer<'info>,

    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// CHECK: PDA checked
    /// CHECK: checks valid u64 in processor below
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), FLASH_ACCOUNT_SEED_SUFFIX],
        bump,
    )]
    pub flash_account: UncheckedAccount<'info>,

    /// flash loan fee account to initialize
    #[account(
        seeds = [&pool_account.key().to_bytes(), FLASH_LOAN_FEE_SEED_SUFFIX],
        bump,
    )]
    pub flash_loan_fee_account: Account<'info, FlashLoanFee>,

    #[account(
        seeds = [PROTOCOL_FEE_SEED],
        bump,
    )]
    pub protocol_fee_account: Account<'info, ProtocolFee>,

    /// CHECK: address-check checks that its the correct
    /// destination specified in `protocol_fee_account`
    #[account(
        mut,
        address = protocol_fee_account.destination @ UnstakeError::WrongProtocolFeeDestination,
    )]
    pub protocol_fee_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RepayFlashLoan<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<'_, '_, '_, 'info, Self>) -> Result<()> {
        let repayer = &ctx.accounts.repayer;
        let pool_account = &ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let flash_account = &ctx.accounts.flash_account;
        let flash_loan_fee_account = &ctx.accounts.flash_loan_fee_account;
        let protocol_fee_account = &ctx.accounts.protocol_fee_account;
        let protocol_fee_destination = &ctx.accounts.protocol_fee_destination;
        let system_program = &ctx.accounts.system_program;

        let curr_flash = FlashAccount::deserialize(flash_account)?;
        let fee_lamports = flash_loan_fee_account
            .apply(curr_flash.lamports_borrowed)
            .ok_or(UnstakeError::InternalError)?;
        let protocol_fee_lamports = protocol_fee_account
            .apply(fee_lamports)
            .ok_or(UnstakeError::InternalError)?;

        let repay_lamports = curr_flash
            .lamports_borrowed
            .checked_add(fee_lamports)
            .ok_or(UnstakeError::InternalError)?;
        transfer(
            CpiContext::new(
                system_program.to_account_info(),
                Transfer {
                    from: repayer.to_account_info(),
                    to: pool_sol_reserves.to_account_info(),
                },
            ),
            repay_lamports,
        )?;

        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];

        // pay out protocol and referrer fees
        let lamports_to_protocol = match Self::referrer(&ctx) {
            None => protocol_fee_lamports,
            Some(referrer) => {
                let lamports_to_referrer = protocol_fee_account
                    .apply_referrer_fee(protocol_fee_lamports)
                    .ok_or(UnstakeError::InternalError)?;
                let lamports_to_protocol = protocol_fee_lamports
                    .checked_sub(lamports_to_referrer)
                    .ok_or(UnstakeError::InternalError)?;

                // pay the referrer fees from the pool reserves
                transfer(
                    CpiContext::new_with_signer(
                        system_program.to_account_info(),
                        Transfer {
                            from: pool_sol_reserves.to_account_info(),
                            to: referrer,
                        },
                        &[seeds],
                    ),
                    lamports_to_referrer,
                )?;

                lamports_to_protocol
            }
        };
        transfer(
            CpiContext::new_with_signer(
                system_program.to_account_info(),
                Transfer {
                    from: pool_sol_reserves.to_account_info(),
                    to: protocol_fee_destination.to_account_info(),
                },
                &[seeds],
            ),
            lamports_to_protocol,
        )?;

        // close flash account
        let sol_reserves_starting_lamports = pool_sol_reserves.lamports();
        **pool_sol_reserves.lamports.borrow_mut() = sol_reserves_starting_lamports
            .checked_add(flash_account.lamports())
            .ok_or(UnstakeError::InternalError)?;
        **flash_account.lamports.borrow_mut() = 0;
        flash_account.assign(&system_program::ID);
        flash_account.realloc(0, false)?;

        Ok(())
    }

    pub fn referrer(ctx: &Context<'_, '_, '_, 'info, Self>) -> Option<AccountInfo<'info>> {
        ctx.remaining_accounts.first().map(|a| a.to_account_info())
    }
}

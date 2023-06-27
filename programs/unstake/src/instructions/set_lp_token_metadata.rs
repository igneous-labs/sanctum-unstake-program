use anchor_lang::prelude::*;
use anchor_spl::{
    metadata::{
        create_metadata_accounts_v3, set_token_standard, update_metadata_accounts_v2,
        CreateMetadataAccountsV3, Metadata, SetTokenStandard, UpdateMetadataAccountsV2,
    },
    token::Mint,
};
use mpl_token_metadata::state::DataV2;

use crate::{errors::UnstakeError, state::Pool};

/// Creates or updates the metaplex token metadata for the pool's LP token,
/// authorized by the pool's fee authority
#[derive(Accounts)]
pub struct SetLpTokenMetadata<'info> {
    /// account paying for token metadata rent
    #[account(mut)]
    pub payer: Signer<'info>,

    /// pool's fee_authority
    /// Only the pool's fee_authority can mutate LP token metadata
    pub fee_authority: Signer<'info>,

    /// pool account for the fee account
    #[account(
        has_one = fee_authority @ UnstakeError::InvalidFeeAuthority,
        has_one = lp_mint,
    )]
    pub pool_account: Account<'info, Pool>,

    /// pool SOL reserves PDA.
    /// LP token mint authority and metadata update authority
    #[account(
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// pool's LP mint
    pub lp_mint: Account<'info, Mint>,

    /// The metaplex PDA that metadata is saved to
    /// CHECK: metaplex program CPI will check to ensure correct PDA
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    pub metadata_program: Program<'info, Metadata>,

    pub system_program: Program<'info, System>,

    pub rent: Sysvar<'info, Rent>,
}

impl<'info> SetLpTokenMetadata<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, data: DataV2) -> Result<()> {
        let payer = &ctx.accounts.payer;
        let pool_account = &ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let lp_mint = &ctx.accounts.lp_mint;
        let metadata = &ctx.accounts.metadata;
        let metadata_program = &ctx.accounts.metadata_program;
        let system_program = &ctx.accounts.system_program;
        let rent = &ctx.accounts.rent;

        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];
        match metadata.data_is_empty() {
            true => create_metadata_accounts_v3(
                CpiContext::new_with_signer(
                    metadata_program.to_account_info(),
                    CreateMetadataAccountsV3 {
                        metadata: metadata.to_account_info(),
                        mint: lp_mint.to_account_info(),
                        mint_authority: pool_sol_reserves.to_account_info(),
                        payer: payer.to_account_info(),
                        update_authority: pool_sol_reserves.to_account_info(),
                        system_program: system_program.to_account_info(),
                        rent: rent.to_account_info(),
                    },
                    &[seeds],
                ),
                data,
                true,
                true,
                None,
            ),
            false => update_metadata_accounts_v2(
                CpiContext::new_with_signer(
                    metadata_program.to_account_info(),
                    UpdateMetadataAccountsV2 {
                        metadata: metadata.to_account_info(),
                        update_authority: pool_sol_reserves.to_account_info(),
                    },
                    &[seeds],
                ),
                None,
                Some(data),
                None,
                None,
            ),
        }?;

        // TODO: if this fails with signer privilege escalated
        // its because mpl_token_metadata::instruction::set_token_standard
        // has update_authority set to mut
        set_token_standard(
            CpiContext::new_with_signer(
                metadata_program.to_account_info(),
                SetTokenStandard {
                    metadata_account: metadata.to_account_info(),
                    update_authority: pool_sol_reserves.to_account_info(),
                    mint_account: lp_mint.to_account_info(),
                },
                &[seeds],
            ),
            None,
        )?;

        Ok(())
    }
}

use std::convert::TryInto;

use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::Instruction,
        sysvar::{
            self,
            instructions::{load_current_index_checked, load_instruction_at_checked},
        },
    },
    system_program::{transfer, Transfer},
    Discriminator,
};

use crate::{
    errors::UnstakeError,
    instruction::RepayFlashLoan,
    state::{FlashAccount, Pool, FLASH_ACCOUNT_SEED_SUFFIX},
    utils::{allocate_assign_pda, AllocateAssignPdaArgs},
};

#[derive(Accounts)]
pub struct TakeFlashLoan<'info> {
    /// pubkey paying for new accounts' rent
    /// CHECK: flash loan lamports will just be transferred here,
    ///        it's the responsibility of the user to ensure this
    ///        is the correct receiver account
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,

    pub pool_account: Account<'info, Pool>,

    /// pool's SOL reserves
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes()],
        bump,
    )]
    pub pool_sol_reserves: SystemAccount<'info>,

    /// CHECK: PDA checked
    /// CHECK: init_if_needed of hot potato occurs in ix processor below
    #[account(
        mut,
        seeds = [&pool_account.key().to_bytes(), FLASH_ACCOUNT_SEED_SUFFIX],
        bump,
    )]
    pub flash_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// Solana Instructions Sysvar
    /// CHECK: Checked using address
    #[account(address = sysvar::instructions::ID @ UnstakeError::InvalidInstructionsSysvar)]
    pub instructions: UncheckedAccount<'info>,
}

impl<'info> TakeFlashLoan<'info> {
    #[inline(always)]
    pub fn run(ctx: Context<Self>, lamports: u64) -> Result<()> {
        let receiver = &ctx.accounts.receiver;
        let pool_account = &ctx.accounts.pool_account;
        let pool_sol_reserves = &ctx.accounts.pool_sol_reserves;
        let flash_account = &ctx.accounts.flash_account;
        let instructions = &ctx.accounts.instructions;
        let system_program = &ctx.accounts.system_program;

        if !flash_account.data_is_empty() {
            return Err(UnstakeError::FlashLoanActive.into());
        }

        // Check corresponding repay instruction exists
        let current_idx: usize = load_current_index_checked(instructions.as_ref())?.into();
        let mut next_ix_idx = current_idx + 1;
        loop {
            let next_ix = load_instruction_at_checked(next_ix_idx, instructions.as_ref())
                .map_err(|_| UnstakeError::NoSucceedingRepayFlashLoan)?;
            if ctx.accounts.is_corresponding_repay_flash_loan_ix(&next_ix) {
                break;
            }
            next_ix_idx += 1;
        }

        let seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            &[*ctx
                .bumps
                .get("pool_sol_reserves")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];

        // init flash_account
        // you can only invoke_signed with one seed, so
        // we need to split create_account up into
        // allocate, assign, transfer
        let flash_account_seeds: &[&[u8]] = &[
            &pool_account.key().to_bytes(),
            FLASH_ACCOUNT_SEED_SUFFIX,
            &[*ctx
                .bumps
                .get("flash_account")
                .ok_or(UnstakeError::PdaBumpNotCached)?],
        ];
        allocate_assign_pda(AllocateAssignPdaArgs {
            system_program,
            pda_account: flash_account,
            pda_account_owner_program: &crate::ID,
            pda_account_len: FlashAccount::account_len(),
            pda_account_signer_seeds: &[flash_account_seeds],
        })?;
        if flash_account.lamports() == 0 {
            transfer(
                CpiContext::new_with_signer(
                    system_program.to_account_info(),
                    Transfer {
                        from: pool_sol_reserves.to_account_info(),
                        to: flash_account.to_account_info(),
                    },
                    &[seeds],
                ),
                1, // 1 lamport hot potato
            )?;
        }

        // increment and save flash_account
        let mut curr_flash = FlashAccount::deserialize(flash_account)?;
        curr_flash.lamports_borrowed = curr_flash
            .lamports_borrowed
            .checked_add(lamports)
            .ok_or(UnstakeError::InternalError)?;
        curr_flash.serialize(&mut flash_account.to_account_info())?;

        // transfer to receiver
        transfer(
            CpiContext::new_with_signer(
                system_program.to_account_info(),
                Transfer {
                    from: pool_sol_reserves.to_account_info(),
                    to: receiver.to_account_info(),
                },
                &[seeds],
            ),
            lamports,
        )?;

        Ok(())
    }

    pub fn is_corresponding_repay_flash_loan_ix(&self, repay_flash_loan_ix: &Instruction) -> bool {
        let discm: [u8; 8] = match repay_flash_loan_ix.data.get(0..8) {
            Some(slice) => slice.try_into().unwrap(),
            None => return false,
        };
        let pool_account = match repay_flash_loan_ix
            .accounts
            .get(super::repay_flash_loan::POOL_ACCOUNT_ACCOUNT_IDX)
        {
            Some(a) => a,
            None => return false,
        };
        repay_flash_loan_ix.program_id == crate::ID
            && discm == RepayFlashLoan::DISCRIMINATOR
            && pool_account.pubkey == self.pool_account.key()
    }
}

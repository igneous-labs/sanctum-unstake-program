use anchor_lang::{
    prelude::{AccountInfo, CpiContext, Pubkey, Rent, SolanaSysvar},
    system_program::{allocate, assign, transfer, Allocate, Assign, Transfer},
};

pub struct AllocateAssignPdaArgs<'a, 'info: 'a, 's1: 'a, 's2: 'a> {
    pub system_program: &'a AccountInfo<'info>,
    pub pda_account: &'a AccountInfo<'info>,
    pub pda_account_owner_program: &'a Pubkey,
    pub pda_account_len: u64,
    pub pda_account_signer_seeds: &'a [&'s1 [&'s2 [u8]]],
}

pub fn allocate_assign_pda(args: AllocateAssignPdaArgs) -> Result<(), anchor_lang::error::Error> {
    let AllocateAssignPdaArgs {
        system_program,
        pda_account,
        pda_account_owner_program,
        pda_account_len,
        pda_account_signer_seeds,
    } = args;
    allocate(
        CpiContext::new_with_signer(
            system_program.to_owned(),
            Allocate {
                account_to_allocate: pda_account.to_owned(),
            },
            pda_account_signer_seeds,
        ),
        pda_account_len,
    )?;
    assign(
        CpiContext::new_with_signer(
            system_program.to_owned(),
            Assign {
                account_to_assign: pda_account.to_owned(),
            },
            pda_account_signer_seeds,
        ),
        pda_account_owner_program,
    )
}

pub struct MakeRentExemptWithPdaPayerArgs<'a, 'info: 'a, 's1: 'a, 's2: 'a> {
    pub system_program: &'a AccountInfo<'info>,
    pub account: &'a AccountInfo<'info>,
    pub pda_payer: &'a AccountInfo<'info>,
    pub pda_payer_signer_seeds: &'a [&'s1 [&'s2 [u8]]],
}

/// Assumes account has already been allocated and assigned
/// Returns amount of lamports transferred from `pda_payer` to `account`
pub fn make_rent_exempt_with_pda_payer(
    args: MakeRentExemptWithPdaPayerArgs,
) -> Result<(), anchor_lang::error::Error> {
    let MakeRentExemptWithPdaPayerArgs {
        system_program,
        account,
        pda_payer,
        pda_payer_signer_seeds,
    } = args;
    let rent = Rent::get()?;
    let lamports_required = rent
        .minimum_balance(account.data_len())
        .max(1)
        .saturating_sub(account.lamports());
    if lamports_required > 0 {
        transfer(
            CpiContext::new_with_signer(
                system_program.to_owned(),
                Transfer {
                    from: pda_payer.to_owned(),
                    to: account.to_owned(),
                },
                pda_payer_signer_seeds,
            ),
            lamports_required,
        )?;
    }
    Ok(())
}

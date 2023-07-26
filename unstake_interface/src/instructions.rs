use crate::*;
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    pubkey::Pubkey,
};
pub const INIT_PROTOCOL_FEE_IX_ACCOUNTS_LEN: usize = 3usize;
#[derive(Copy, Clone, Debug)]
pub struct InitProtocolFeeAccounts<'me, 'a0: 'me, 'a1: 'me, 'a2: 'me> {
    pub payer: &'me AccountInfo<'a0>,
    pub protocol_fee_account: &'me AccountInfo<'a1>,
    pub system_program: &'me AccountInfo<'a2>,
}
#[derive(Copy, Clone, Debug)]
pub struct InitProtocolFeeKeys {
    pub payer: Pubkey,
    pub protocol_fee_account: Pubkey,
    pub system_program: Pubkey,
}
impl<'me> From<&InitProtocolFeeAccounts<'me, '_, '_, '_>> for InitProtocolFeeKeys {
    fn from(accounts: &InitProtocolFeeAccounts<'me, '_, '_, '_>) -> Self {
        Self {
            payer: *accounts.payer.key,
            protocol_fee_account: *accounts.protocol_fee_account.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<&InitProtocolFeeKeys> for [AccountMeta; INIT_PROTOCOL_FEE_IX_ACCOUNTS_LEN] {
    fn from(keys: &InitProtocolFeeKeys) -> Self {
        [
            AccountMeta::new(keys.payer, true),
            AccountMeta::new(keys.protocol_fee_account, false),
            AccountMeta::new_readonly(keys.system_program, false),
        ]
    }
}
impl<'a> From<&InitProtocolFeeAccounts<'_, 'a, 'a, 'a>>
    for [AccountInfo<'a>; INIT_PROTOCOL_FEE_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &InitProtocolFeeAccounts<'_, 'a, 'a, 'a>) -> Self {
        [
            accounts.payer.clone(),
            accounts.protocol_fee_account.clone(),
            accounts.system_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct InitProtocolFeeIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct InitProtocolFeeIxData<'me>(pub &'me InitProtocolFeeIxArgs);
pub const INIT_PROTOCOL_FEE_IX_DISCM: [u8; 8] = [225, 155, 167, 170, 29, 145, 165, 90];
impl<'me> From<&'me InitProtocolFeeIxArgs> for InitProtocolFeeIxData<'me> {
    fn from(args: &'me InitProtocolFeeIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for InitProtocolFeeIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&INIT_PROTOCOL_FEE_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn init_protocol_fee_ix<K: Into<InitProtocolFeeKeys>, A: Into<InitProtocolFeeIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: InitProtocolFeeKeys = accounts.into();
    let metas: [AccountMeta; INIT_PROTOCOL_FEE_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: InitProtocolFeeIxArgs = args.into();
    let data: InitProtocolFeeIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn init_protocol_fee_invoke<'a, A: Into<InitProtocolFeeIxArgs>>(
    accounts: &InitProtocolFeeAccounts<'_, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = init_protocol_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; INIT_PROTOCOL_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn init_protocol_fee_invoke_signed<'a, A: Into<InitProtocolFeeIxArgs>>(
    accounts: &InitProtocolFeeAccounts<'_, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = init_protocol_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; INIT_PROTOCOL_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const SET_PROTOCOL_FEE_IX_ACCOUNTS_LEN: usize = 2usize;
#[derive(Copy, Clone, Debug)]
pub struct SetProtocolFeeAccounts<'me, 'a0: 'me, 'a1: 'me> {
    pub authority: &'me AccountInfo<'a0>,
    pub protocol_fee_account: &'me AccountInfo<'a1>,
}
#[derive(Copy, Clone, Debug)]
pub struct SetProtocolFeeKeys {
    pub authority: Pubkey,
    pub protocol_fee_account: Pubkey,
}
impl<'me> From<&SetProtocolFeeAccounts<'me, '_, '_>> for SetProtocolFeeKeys {
    fn from(accounts: &SetProtocolFeeAccounts<'me, '_, '_>) -> Self {
        Self {
            authority: *accounts.authority.key,
            protocol_fee_account: *accounts.protocol_fee_account.key,
        }
    }
}
impl From<&SetProtocolFeeKeys> for [AccountMeta; SET_PROTOCOL_FEE_IX_ACCOUNTS_LEN] {
    fn from(keys: &SetProtocolFeeKeys) -> Self {
        [
            AccountMeta::new_readonly(keys.authority, true),
            AccountMeta::new(keys.protocol_fee_account, false),
        ]
    }
}
impl<'a> From<&SetProtocolFeeAccounts<'_, 'a, 'a>>
    for [AccountInfo<'a>; SET_PROTOCOL_FEE_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &SetProtocolFeeAccounts<'_, 'a, 'a>) -> Self {
        [
            accounts.authority.clone(),
            accounts.protocol_fee_account.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct SetProtocolFeeIxArgs {
    pub protocol_fee: ProtocolFee,
}
#[derive(Copy, Clone, Debug)]
pub struct SetProtocolFeeIxData<'me>(pub &'me SetProtocolFeeIxArgs);
pub const SET_PROTOCOL_FEE_IX_DISCM: [u8; 8] = [173, 239, 83, 242, 136, 43, 144, 217];
impl<'me> From<&'me SetProtocolFeeIxArgs> for SetProtocolFeeIxData<'me> {
    fn from(args: &'me SetProtocolFeeIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for SetProtocolFeeIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&SET_PROTOCOL_FEE_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn set_protocol_fee_ix<K: Into<SetProtocolFeeKeys>, A: Into<SetProtocolFeeIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: SetProtocolFeeKeys = accounts.into();
    let metas: [AccountMeta; SET_PROTOCOL_FEE_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: SetProtocolFeeIxArgs = args.into();
    let data: SetProtocolFeeIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn set_protocol_fee_invoke<'a, A: Into<SetProtocolFeeIxArgs>>(
    accounts: &SetProtocolFeeAccounts<'_, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = set_protocol_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_PROTOCOL_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn set_protocol_fee_invoke_signed<'a, A: Into<SetProtocolFeeIxArgs>>(
    accounts: &SetProtocolFeeAccounts<'_, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = set_protocol_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_PROTOCOL_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const CREATE_POOL_IX_ACCOUNTS_LEN: usize = 9usize;
#[derive(Copy, Clone, Debug)]
pub struct CreatePoolAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
    'a7: 'me,
    'a8: 'me,
> {
    pub payer: &'me AccountInfo<'a0>,
    pub fee_authority: &'me AccountInfo<'a1>,
    pub pool_account: &'me AccountInfo<'a2>,
    pub pool_sol_reserves: &'me AccountInfo<'a3>,
    pub fee_account: &'me AccountInfo<'a4>,
    pub lp_mint: &'me AccountInfo<'a5>,
    pub token_program: &'me AccountInfo<'a6>,
    pub system_program: &'me AccountInfo<'a7>,
    pub rent: &'me AccountInfo<'a8>,
}
#[derive(Copy, Clone, Debug)]
pub struct CreatePoolKeys {
    pub payer: Pubkey,
    pub fee_authority: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub fee_account: Pubkey,
    pub lp_mint: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl<'me> From<&CreatePoolAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_>> for CreatePoolKeys {
    fn from(accounts: &CreatePoolAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_>) -> Self {
        Self {
            payer: *accounts.payer.key,
            fee_authority: *accounts.fee_authority.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            fee_account: *accounts.fee_account.key,
            lp_mint: *accounts.lp_mint.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<&CreatePoolKeys> for [AccountMeta; CREATE_POOL_IX_ACCOUNTS_LEN] {
    fn from(keys: &CreatePoolKeys) -> Self {
        [
            AccountMeta::new(keys.payer, true),
            AccountMeta::new_readonly(keys.fee_authority, true),
            AccountMeta::new(keys.pool_account, true),
            AccountMeta::new_readonly(keys.pool_sol_reserves, false),
            AccountMeta::new(keys.fee_account, false),
            AccountMeta::new(keys.lp_mint, true),
            AccountMeta::new_readonly(keys.token_program, false),
            AccountMeta::new_readonly(keys.system_program, false),
            AccountMeta::new_readonly(keys.rent, false),
        ]
    }
}
impl<'a> From<&CreatePoolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; CREATE_POOL_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &CreatePoolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.payer.clone(),
            accounts.fee_authority.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.fee_account.clone(),
            accounts.lp_mint.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct CreatePoolIxArgs {
    pub fee: Fee,
}
#[derive(Copy, Clone, Debug)]
pub struct CreatePoolIxData<'me>(pub &'me CreatePoolIxArgs);
pub const CREATE_POOL_IX_DISCM: [u8; 8] = [233, 146, 209, 142, 207, 104, 64, 188];
impl<'me> From<&'me CreatePoolIxArgs> for CreatePoolIxData<'me> {
    fn from(args: &'me CreatePoolIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for CreatePoolIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&CREATE_POOL_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn create_pool_ix<K: Into<CreatePoolKeys>, A: Into<CreatePoolIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: CreatePoolKeys = accounts.into();
    let metas: [AccountMeta; CREATE_POOL_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: CreatePoolIxArgs = args.into();
    let data: CreatePoolIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn create_pool_invoke<'a, A: Into<CreatePoolIxArgs>>(
    accounts: &CreatePoolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = create_pool_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; CREATE_POOL_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn create_pool_invoke_signed<'a, A: Into<CreatePoolIxArgs>>(
    accounts: &CreatePoolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = create_pool_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; CREATE_POOL_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const ADD_LIQUIDITY_IX_ACCOUNTS_LEN: usize = 7usize;
#[derive(Copy, Clone, Debug)]
pub struct AddLiquidityAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
> {
    pub from: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub pool_sol_reserves: &'me AccountInfo<'a2>,
    pub lp_mint: &'me AccountInfo<'a3>,
    pub mint_lp_tokens_to: &'me AccountInfo<'a4>,
    pub token_program: &'me AccountInfo<'a5>,
    pub system_program: &'me AccountInfo<'a6>,
}
#[derive(Copy, Clone, Debug)]
pub struct AddLiquidityKeys {
    pub from: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub lp_mint: Pubkey,
    pub mint_lp_tokens_to: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
}
impl<'me> From<&AddLiquidityAccounts<'me, '_, '_, '_, '_, '_, '_, '_>> for AddLiquidityKeys {
    fn from(accounts: &AddLiquidityAccounts<'me, '_, '_, '_, '_, '_, '_, '_>) -> Self {
        Self {
            from: *accounts.from.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            lp_mint: *accounts.lp_mint.key,
            mint_lp_tokens_to: *accounts.mint_lp_tokens_to.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<&AddLiquidityKeys> for [AccountMeta; ADD_LIQUIDITY_IX_ACCOUNTS_LEN] {
    fn from(keys: &AddLiquidityKeys) -> Self {
        [
            AccountMeta::new(keys.from, true),
            AccountMeta::new(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new(keys.lp_mint, false),
            AccountMeta::new(keys.mint_lp_tokens_to, false),
            AccountMeta::new_readonly(keys.token_program, false),
            AccountMeta::new_readonly(keys.system_program, false),
        ]
    }
}
impl<'a> From<&AddLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; ADD_LIQUIDITY_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &AddLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.from.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.lp_mint.clone(),
            accounts.mint_lp_tokens_to.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct AddLiquidityIxArgs {
    pub amount: u64,
}
#[derive(Copy, Clone, Debug)]
pub struct AddLiquidityIxData<'me>(pub &'me AddLiquidityIxArgs);
pub const ADD_LIQUIDITY_IX_DISCM: [u8; 8] = [181, 157, 89, 67, 143, 182, 52, 72];
impl<'me> From<&'me AddLiquidityIxArgs> for AddLiquidityIxData<'me> {
    fn from(args: &'me AddLiquidityIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for AddLiquidityIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&ADD_LIQUIDITY_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn add_liquidity_ix<K: Into<AddLiquidityKeys>, A: Into<AddLiquidityIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: AddLiquidityKeys = accounts.into();
    let metas: [AccountMeta; ADD_LIQUIDITY_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: AddLiquidityIxArgs = args.into();
    let data: AddLiquidityIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn add_liquidity_invoke<'a, A: Into<AddLiquidityIxArgs>>(
    accounts: &AddLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = add_liquidity_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; ADD_LIQUIDITY_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn add_liquidity_invoke_signed<'a, A: Into<AddLiquidityIxArgs>>(
    accounts: &AddLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = add_liquidity_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; ADD_LIQUIDITY_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const REMOVE_LIQUIDITY_IX_ACCOUNTS_LEN: usize = 8usize;
#[derive(Copy, Clone, Debug)]
pub struct RemoveLiquidityAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
    'a7: 'me,
> {
    pub burn_lp_tokens_from_authority: &'me AccountInfo<'a0>,
    pub to: &'me AccountInfo<'a1>,
    pub pool_account: &'me AccountInfo<'a2>,
    pub pool_sol_reserves: &'me AccountInfo<'a3>,
    pub lp_mint: &'me AccountInfo<'a4>,
    pub burn_lp_tokens_from: &'me AccountInfo<'a5>,
    pub token_program: &'me AccountInfo<'a6>,
    pub system_program: &'me AccountInfo<'a7>,
}
#[derive(Copy, Clone, Debug)]
pub struct RemoveLiquidityKeys {
    pub burn_lp_tokens_from_authority: Pubkey,
    pub to: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub lp_mint: Pubkey,
    pub burn_lp_tokens_from: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
}
impl<'me> From<&RemoveLiquidityAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_>>
    for RemoveLiquidityKeys
{
    fn from(accounts: &RemoveLiquidityAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_>) -> Self {
        Self {
            burn_lp_tokens_from_authority: *accounts.burn_lp_tokens_from_authority.key,
            to: *accounts.to.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            lp_mint: *accounts.lp_mint.key,
            burn_lp_tokens_from: *accounts.burn_lp_tokens_from.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<&RemoveLiquidityKeys> for [AccountMeta; REMOVE_LIQUIDITY_IX_ACCOUNTS_LEN] {
    fn from(keys: &RemoveLiquidityKeys) -> Self {
        [
            AccountMeta::new_readonly(keys.burn_lp_tokens_from_authority, true),
            AccountMeta::new(keys.to, false),
            AccountMeta::new(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new(keys.lp_mint, false),
            AccountMeta::new(keys.burn_lp_tokens_from, false),
            AccountMeta::new_readonly(keys.token_program, false),
            AccountMeta::new_readonly(keys.system_program, false),
        ]
    }
}
impl<'a> From<&RemoveLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; REMOVE_LIQUIDITY_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &RemoveLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.burn_lp_tokens_from_authority.clone(),
            accounts.to.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.lp_mint.clone(),
            accounts.burn_lp_tokens_from.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct RemoveLiquidityIxArgs {
    pub amount_lp: u64,
}
#[derive(Copy, Clone, Debug)]
pub struct RemoveLiquidityIxData<'me>(pub &'me RemoveLiquidityIxArgs);
pub const REMOVE_LIQUIDITY_IX_DISCM: [u8; 8] = [80, 85, 209, 72, 24, 206, 177, 108];
impl<'me> From<&'me RemoveLiquidityIxArgs> for RemoveLiquidityIxData<'me> {
    fn from(args: &'me RemoveLiquidityIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for RemoveLiquidityIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&REMOVE_LIQUIDITY_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn remove_liquidity_ix<K: Into<RemoveLiquidityKeys>, A: Into<RemoveLiquidityIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: RemoveLiquidityKeys = accounts.into();
    let metas: [AccountMeta; REMOVE_LIQUIDITY_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: RemoveLiquidityIxArgs = args.into();
    let data: RemoveLiquidityIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn remove_liquidity_invoke<'a, A: Into<RemoveLiquidityIxArgs>>(
    accounts: &RemoveLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = remove_liquidity_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; REMOVE_LIQUIDITY_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn remove_liquidity_invoke_signed<'a, A: Into<RemoveLiquidityIxArgs>>(
    accounts: &RemoveLiquidityAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = remove_liquidity_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; REMOVE_LIQUIDITY_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const SET_FEE_IX_ACCOUNTS_LEN: usize = 5usize;
#[derive(Copy, Clone, Debug)]
pub struct SetFeeAccounts<'me, 'a0: 'me, 'a1: 'me, 'a2: 'me, 'a3: 'me, 'a4: 'me> {
    pub fee_authority: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub fee_account: &'me AccountInfo<'a2>,
    pub system_program: &'me AccountInfo<'a3>,
    pub rent: &'me AccountInfo<'a4>,
}
#[derive(Copy, Clone, Debug)]
pub struct SetFeeKeys {
    pub fee_authority: Pubkey,
    pub pool_account: Pubkey,
    pub fee_account: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl<'me> From<&SetFeeAccounts<'me, '_, '_, '_, '_, '_>> for SetFeeKeys {
    fn from(accounts: &SetFeeAccounts<'me, '_, '_, '_, '_, '_>) -> Self {
        Self {
            fee_authority: *accounts.fee_authority.key,
            pool_account: *accounts.pool_account.key,
            fee_account: *accounts.fee_account.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<&SetFeeKeys> for [AccountMeta; SET_FEE_IX_ACCOUNTS_LEN] {
    fn from(keys: &SetFeeKeys) -> Self {
        [
            AccountMeta::new_readonly(keys.fee_authority, true),
            AccountMeta::new_readonly(keys.pool_account, false),
            AccountMeta::new(keys.fee_account, false),
            AccountMeta::new_readonly(keys.system_program, false),
            AccountMeta::new_readonly(keys.rent, false),
        ]
    }
}
impl<'a> From<&SetFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; SET_FEE_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &SetFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.fee_authority.clone(),
            accounts.pool_account.clone(),
            accounts.fee_account.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct SetFeeIxArgs {
    pub fee: Fee,
}
#[derive(Copy, Clone, Debug)]
pub struct SetFeeIxData<'me>(pub &'me SetFeeIxArgs);
pub const SET_FEE_IX_DISCM: [u8; 8] = [18, 154, 24, 18, 237, 214, 19, 80];
impl<'me> From<&'me SetFeeIxArgs> for SetFeeIxData<'me> {
    fn from(args: &'me SetFeeIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for SetFeeIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&SET_FEE_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn set_fee_ix<K: Into<SetFeeKeys>, A: Into<SetFeeIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: SetFeeKeys = accounts.into();
    let metas: [AccountMeta; SET_FEE_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: SetFeeIxArgs = args.into();
    let data: SetFeeIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn set_fee_invoke<'a, A: Into<SetFeeIxArgs>>(
    accounts: &SetFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = set_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn set_fee_invoke_signed<'a, A: Into<SetFeeIxArgs>>(
    accounts: &SetFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = set_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const SET_FEE_AUTHORITY_IX_ACCOUNTS_LEN: usize = 3usize;
#[derive(Copy, Clone, Debug)]
pub struct SetFeeAuthorityAccounts<'me, 'a0: 'me, 'a1: 'me, 'a2: 'me> {
    pub fee_authority: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub new_fee_authority: &'me AccountInfo<'a2>,
}
#[derive(Copy, Clone, Debug)]
pub struct SetFeeAuthorityKeys {
    pub fee_authority: Pubkey,
    pub pool_account: Pubkey,
    pub new_fee_authority: Pubkey,
}
impl<'me> From<&SetFeeAuthorityAccounts<'me, '_, '_, '_>> for SetFeeAuthorityKeys {
    fn from(accounts: &SetFeeAuthorityAccounts<'me, '_, '_, '_>) -> Self {
        Self {
            fee_authority: *accounts.fee_authority.key,
            pool_account: *accounts.pool_account.key,
            new_fee_authority: *accounts.new_fee_authority.key,
        }
    }
}
impl From<&SetFeeAuthorityKeys> for [AccountMeta; SET_FEE_AUTHORITY_IX_ACCOUNTS_LEN] {
    fn from(keys: &SetFeeAuthorityKeys) -> Self {
        [
            AccountMeta::new_readonly(keys.fee_authority, true),
            AccountMeta::new(keys.pool_account, false),
            AccountMeta::new_readonly(keys.new_fee_authority, false),
        ]
    }
}
impl<'a> From<&SetFeeAuthorityAccounts<'_, 'a, 'a, 'a>>
    for [AccountInfo<'a>; SET_FEE_AUTHORITY_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &SetFeeAuthorityAccounts<'_, 'a, 'a, 'a>) -> Self {
        [
            accounts.fee_authority.clone(),
            accounts.pool_account.clone(),
            accounts.new_fee_authority.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct SetFeeAuthorityIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct SetFeeAuthorityIxData<'me>(pub &'me SetFeeAuthorityIxArgs);
pub const SET_FEE_AUTHORITY_IX_DISCM: [u8; 8] = [31, 1, 50, 87, 237, 101, 97, 132];
impl<'me> From<&'me SetFeeAuthorityIxArgs> for SetFeeAuthorityIxData<'me> {
    fn from(args: &'me SetFeeAuthorityIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for SetFeeAuthorityIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&SET_FEE_AUTHORITY_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn set_fee_authority_ix<K: Into<SetFeeAuthorityKeys>, A: Into<SetFeeAuthorityIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: SetFeeAuthorityKeys = accounts.into();
    let metas: [AccountMeta; SET_FEE_AUTHORITY_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: SetFeeAuthorityIxArgs = args.into();
    let data: SetFeeAuthorityIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn set_fee_authority_invoke<'a, A: Into<SetFeeAuthorityIxArgs>>(
    accounts: &SetFeeAuthorityAccounts<'_, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = set_fee_authority_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_FEE_AUTHORITY_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn set_fee_authority_invoke_signed<'a, A: Into<SetFeeAuthorityIxArgs>>(
    accounts: &SetFeeAuthorityAccounts<'_, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = set_fee_authority_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_FEE_AUTHORITY_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const SET_LP_TOKEN_METADATA_IX_ACCOUNTS_LEN: usize = 9usize;
#[derive(Copy, Clone, Debug)]
pub struct SetLpTokenMetadataAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
    'a7: 'me,
    'a8: 'me,
> {
    pub payer: &'me AccountInfo<'a0>,
    pub fee_authority: &'me AccountInfo<'a1>,
    pub pool_account: &'me AccountInfo<'a2>,
    pub pool_sol_reserves: &'me AccountInfo<'a3>,
    pub lp_mint: &'me AccountInfo<'a4>,
    pub metadata: &'me AccountInfo<'a5>,
    pub metadata_program: &'me AccountInfo<'a6>,
    pub system_program: &'me AccountInfo<'a7>,
    pub rent: &'me AccountInfo<'a8>,
}
#[derive(Copy, Clone, Debug)]
pub struct SetLpTokenMetadataKeys {
    pub payer: Pubkey,
    pub fee_authority: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub lp_mint: Pubkey,
    pub metadata: Pubkey,
    pub metadata_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl<'me> From<&SetLpTokenMetadataAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_>>
    for SetLpTokenMetadataKeys
{
    fn from(
        accounts: &SetLpTokenMetadataAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_>,
    ) -> Self {
        Self {
            payer: *accounts.payer.key,
            fee_authority: *accounts.fee_authority.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            lp_mint: *accounts.lp_mint.key,
            metadata: *accounts.metadata.key,
            metadata_program: *accounts.metadata_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<&SetLpTokenMetadataKeys> for [AccountMeta; SET_LP_TOKEN_METADATA_IX_ACCOUNTS_LEN] {
    fn from(keys: &SetLpTokenMetadataKeys) -> Self {
        [
            AccountMeta::new(keys.payer, true),
            AccountMeta::new_readonly(keys.fee_authority, true),
            AccountMeta::new_readonly(keys.pool_account, false),
            AccountMeta::new_readonly(keys.pool_sol_reserves, false),
            AccountMeta::new_readonly(keys.lp_mint, false),
            AccountMeta::new(keys.metadata, false),
            AccountMeta::new_readonly(keys.metadata_program, false),
            AccountMeta::new_readonly(keys.system_program, false),
            AccountMeta::new_readonly(keys.rent, false),
        ]
    }
}
impl<'a> From<&SetLpTokenMetadataAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; SET_LP_TOKEN_METADATA_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &SetLpTokenMetadataAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.payer.clone(),
            accounts.fee_authority.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.lp_mint.clone(),
            accounts.metadata.clone(),
            accounts.metadata_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct SetLpTokenMetadataIxArgs {
    pub data: DataV2LpToken,
}
#[derive(Copy, Clone, Debug)]
pub struct SetLpTokenMetadataIxData<'me>(pub &'me SetLpTokenMetadataIxArgs);
pub const SET_LP_TOKEN_METADATA_IX_DISCM: [u8; 8] = [71, 73, 56, 155, 202, 142, 100, 150];
impl<'me> From<&'me SetLpTokenMetadataIxArgs> for SetLpTokenMetadataIxData<'me> {
    fn from(args: &'me SetLpTokenMetadataIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for SetLpTokenMetadataIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&SET_LP_TOKEN_METADATA_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn set_lp_token_metadata_ix<
    K: Into<SetLpTokenMetadataKeys>,
    A: Into<SetLpTokenMetadataIxArgs>,
>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: SetLpTokenMetadataKeys = accounts.into();
    let metas: [AccountMeta; SET_LP_TOKEN_METADATA_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: SetLpTokenMetadataIxArgs = args.into();
    let data: SetLpTokenMetadataIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn set_lp_token_metadata_invoke<'a, A: Into<SetLpTokenMetadataIxArgs>>(
    accounts: &SetLpTokenMetadataAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = set_lp_token_metadata_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_LP_TOKEN_METADATA_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn set_lp_token_metadata_invoke_signed<'a, A: Into<SetLpTokenMetadataIxArgs>>(
    accounts: &SetLpTokenMetadataAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = set_lp_token_metadata_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_LP_TOKEN_METADATA_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const DEACTIVATE_STAKE_ACCOUNT_IX_ACCOUNTS_LEN: usize = 5usize;
#[derive(Copy, Clone, Debug)]
pub struct DeactivateStakeAccountAccounts<'me, 'a0: 'me, 'a1: 'me, 'a2: 'me, 'a3: 'me, 'a4: 'me> {
    pub stake_account: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub pool_sol_reserves: &'me AccountInfo<'a2>,
    pub clock: &'me AccountInfo<'a3>,
    pub stake_program: &'me AccountInfo<'a4>,
}
#[derive(Copy, Clone, Debug)]
pub struct DeactivateStakeAccountKeys {
    pub stake_account: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub clock: Pubkey,
    pub stake_program: Pubkey,
}
impl<'me> From<&DeactivateStakeAccountAccounts<'me, '_, '_, '_, '_, '_>>
    for DeactivateStakeAccountKeys
{
    fn from(accounts: &DeactivateStakeAccountAccounts<'me, '_, '_, '_, '_, '_>) -> Self {
        Self {
            stake_account: *accounts.stake_account.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            clock: *accounts.clock.key,
            stake_program: *accounts.stake_program.key,
        }
    }
}
impl From<&DeactivateStakeAccountKeys> for [AccountMeta; DEACTIVATE_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] {
    fn from(keys: &DeactivateStakeAccountKeys) -> Self {
        [
            AccountMeta::new(keys.stake_account, false),
            AccountMeta::new_readonly(keys.pool_account, false),
            AccountMeta::new_readonly(keys.pool_sol_reserves, false),
            AccountMeta::new_readonly(keys.clock, false),
            AccountMeta::new_readonly(keys.stake_program, false),
        ]
    }
}
impl<'a> From<&DeactivateStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; DEACTIVATE_STAKE_ACCOUNT_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &DeactivateStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.stake_account.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.clock.clone(),
            accounts.stake_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct DeactivateStakeAccountIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct DeactivateStakeAccountIxData<'me>(pub &'me DeactivateStakeAccountIxArgs);
pub const DEACTIVATE_STAKE_ACCOUNT_IX_DISCM: [u8; 8] = [217, 64, 76, 16, 216, 77, 123, 226];
impl<'me> From<&'me DeactivateStakeAccountIxArgs> for DeactivateStakeAccountIxData<'me> {
    fn from(args: &'me DeactivateStakeAccountIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for DeactivateStakeAccountIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&DEACTIVATE_STAKE_ACCOUNT_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn deactivate_stake_account_ix<
    K: Into<DeactivateStakeAccountKeys>,
    A: Into<DeactivateStakeAccountIxArgs>,
>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: DeactivateStakeAccountKeys = accounts.into();
    let metas: [AccountMeta; DEACTIVATE_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: DeactivateStakeAccountIxArgs = args.into();
    let data: DeactivateStakeAccountIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn deactivate_stake_account_invoke<'a, A: Into<DeactivateStakeAccountIxArgs>>(
    accounts: &DeactivateStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = deactivate_stake_account_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; DEACTIVATE_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn deactivate_stake_account_invoke_signed<'a, A: Into<DeactivateStakeAccountIxArgs>>(
    accounts: &DeactivateStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = deactivate_stake_account_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; DEACTIVATE_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const RECLAIM_STAKE_ACCOUNT_IX_ACCOUNTS_LEN: usize = 7usize;
#[derive(Copy, Clone, Debug)]
pub struct ReclaimStakeAccountAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
> {
    pub stake_account: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub pool_sol_reserves: &'me AccountInfo<'a2>,
    pub stake_account_record_account: &'me AccountInfo<'a3>,
    pub clock: &'me AccountInfo<'a4>,
    pub stake_history: &'me AccountInfo<'a5>,
    pub stake_program: &'me AccountInfo<'a6>,
}
#[derive(Copy, Clone, Debug)]
pub struct ReclaimStakeAccountKeys {
    pub stake_account: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub stake_account_record_account: Pubkey,
    pub clock: Pubkey,
    pub stake_history: Pubkey,
    pub stake_program: Pubkey,
}
impl<'me> From<&ReclaimStakeAccountAccounts<'me, '_, '_, '_, '_, '_, '_, '_>>
    for ReclaimStakeAccountKeys
{
    fn from(accounts: &ReclaimStakeAccountAccounts<'me, '_, '_, '_, '_, '_, '_, '_>) -> Self {
        Self {
            stake_account: *accounts.stake_account.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            stake_account_record_account: *accounts.stake_account_record_account.key,
            clock: *accounts.clock.key,
            stake_history: *accounts.stake_history.key,
            stake_program: *accounts.stake_program.key,
        }
    }
}
impl From<&ReclaimStakeAccountKeys> for [AccountMeta; RECLAIM_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] {
    fn from(keys: &ReclaimStakeAccountKeys) -> Self {
        [
            AccountMeta::new(keys.stake_account, false),
            AccountMeta::new(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new(keys.stake_account_record_account, false),
            AccountMeta::new_readonly(keys.clock, false),
            AccountMeta::new_readonly(keys.stake_history, false),
            AccountMeta::new_readonly(keys.stake_program, false),
        ]
    }
}
impl<'a> From<&ReclaimStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; RECLAIM_STAKE_ACCOUNT_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &ReclaimStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.stake_account.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.stake_account_record_account.clone(),
            accounts.clock.clone(),
            accounts.stake_history.clone(),
            accounts.stake_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct ReclaimStakeAccountIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct ReclaimStakeAccountIxData<'me>(pub &'me ReclaimStakeAccountIxArgs);
pub const RECLAIM_STAKE_ACCOUNT_IX_DISCM: [u8; 8] = [47, 127, 90, 221, 10, 160, 183, 117];
impl<'me> From<&'me ReclaimStakeAccountIxArgs> for ReclaimStakeAccountIxData<'me> {
    fn from(args: &'me ReclaimStakeAccountIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for ReclaimStakeAccountIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&RECLAIM_STAKE_ACCOUNT_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn reclaim_stake_account_ix<
    K: Into<ReclaimStakeAccountKeys>,
    A: Into<ReclaimStakeAccountIxArgs>,
>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: ReclaimStakeAccountKeys = accounts.into();
    let metas: [AccountMeta; RECLAIM_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: ReclaimStakeAccountIxArgs = args.into();
    let data: ReclaimStakeAccountIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn reclaim_stake_account_invoke<'a, A: Into<ReclaimStakeAccountIxArgs>>(
    accounts: &ReclaimStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = reclaim_stake_account_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; RECLAIM_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn reclaim_stake_account_invoke_signed<'a, A: Into<ReclaimStakeAccountIxArgs>>(
    accounts: &ReclaimStakeAccountAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = reclaim_stake_account_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; RECLAIM_STAKE_ACCOUNT_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const UNSTAKE_IX_ACCOUNTS_LEN: usize = 12usize;
#[derive(Copy, Clone, Debug)]
pub struct UnstakeAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
    'a7: 'me,
    'a8: 'me,
    'a9: 'me,
    'a10: 'me,
    'a11: 'me,
> {
    pub unstaker: &'me AccountInfo<'a0>,
    pub stake_account: &'me AccountInfo<'a1>,
    pub destination: &'me AccountInfo<'a2>,
    pub pool_account: &'me AccountInfo<'a3>,
    pub pool_sol_reserves: &'me AccountInfo<'a4>,
    pub fee_account: &'me AccountInfo<'a5>,
    pub stake_account_record_account: &'me AccountInfo<'a6>,
    pub protocol_fee_account: &'me AccountInfo<'a7>,
    pub protocol_fee_destination: &'me AccountInfo<'a8>,
    pub clock: &'me AccountInfo<'a9>,
    pub stake_program: &'me AccountInfo<'a10>,
    pub system_program: &'me AccountInfo<'a11>,
}
#[derive(Copy, Clone, Debug)]
pub struct UnstakeKeys {
    pub unstaker: Pubkey,
    pub stake_account: Pubkey,
    pub destination: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub fee_account: Pubkey,
    pub stake_account_record_account: Pubkey,
    pub protocol_fee_account: Pubkey,
    pub protocol_fee_destination: Pubkey,
    pub clock: Pubkey,
    pub stake_program: Pubkey,
    pub system_program: Pubkey,
}
impl<'me> From<&UnstakeAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_>>
    for UnstakeKeys
{
    fn from(
        accounts: &UnstakeAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_>,
    ) -> Self {
        Self {
            unstaker: *accounts.unstaker.key,
            stake_account: *accounts.stake_account.key,
            destination: *accounts.destination.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            fee_account: *accounts.fee_account.key,
            stake_account_record_account: *accounts.stake_account_record_account.key,
            protocol_fee_account: *accounts.protocol_fee_account.key,
            protocol_fee_destination: *accounts.protocol_fee_destination.key,
            clock: *accounts.clock.key,
            stake_program: *accounts.stake_program.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<&UnstakeKeys> for [AccountMeta; UNSTAKE_IX_ACCOUNTS_LEN] {
    fn from(keys: &UnstakeKeys) -> Self {
        [
            AccountMeta::new_readonly(keys.unstaker, true),
            AccountMeta::new(keys.stake_account, false),
            AccountMeta::new(keys.destination, false),
            AccountMeta::new(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new_readonly(keys.fee_account, false),
            AccountMeta::new(keys.stake_account_record_account, false),
            AccountMeta::new_readonly(keys.protocol_fee_account, false),
            AccountMeta::new(keys.protocol_fee_destination, false),
            AccountMeta::new_readonly(keys.clock, false),
            AccountMeta::new_readonly(keys.stake_program, false),
            AccountMeta::new_readonly(keys.system_program, false),
        ]
    }
}
impl<'a> From<&UnstakeAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; UNSTAKE_IX_ACCOUNTS_LEN]
{
    fn from(
        accounts: &UnstakeAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    ) -> Self {
        [
            accounts.unstaker.clone(),
            accounts.stake_account.clone(),
            accounts.destination.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.fee_account.clone(),
            accounts.stake_account_record_account.clone(),
            accounts.protocol_fee_account.clone(),
            accounts.protocol_fee_destination.clone(),
            accounts.clock.clone(),
            accounts.stake_program.clone(),
            accounts.system_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct UnstakeIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct UnstakeIxData<'me>(pub &'me UnstakeIxArgs);
pub const UNSTAKE_IX_DISCM: [u8; 8] = [90, 95, 107, 42, 205, 124, 50, 225];
impl<'me> From<&'me UnstakeIxArgs> for UnstakeIxData<'me> {
    fn from(args: &'me UnstakeIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for UnstakeIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&UNSTAKE_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn unstake_ix<K: Into<UnstakeKeys>, A: Into<UnstakeIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: UnstakeKeys = accounts.into();
    let metas: [AccountMeta; UNSTAKE_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: UnstakeIxArgs = args.into();
    let data: UnstakeIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn unstake_invoke<'a, A: Into<UnstakeIxArgs>>(
    accounts: &UnstakeAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = unstake_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; UNSTAKE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn unstake_invoke_signed<'a, A: Into<UnstakeIxArgs>>(
    accounts: &UnstakeAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = unstake_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; UNSTAKE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const UNSTAKE_WSOL_IX_ACCOUNTS_LEN: usize = 13usize;
#[derive(Copy, Clone, Debug)]
pub struct UnstakeWsolAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
    'a7: 'me,
    'a8: 'me,
    'a9: 'me,
    'a10: 'me,
    'a11: 'me,
    'a12: 'me,
> {
    pub unstaker: &'me AccountInfo<'a0>,
    pub stake_account: &'me AccountInfo<'a1>,
    pub destination: &'me AccountInfo<'a2>,
    pub pool_account: &'me AccountInfo<'a3>,
    pub pool_sol_reserves: &'me AccountInfo<'a4>,
    pub fee_account: &'me AccountInfo<'a5>,
    pub stake_account_record_account: &'me AccountInfo<'a6>,
    pub protocol_fee_account: &'me AccountInfo<'a7>,
    pub protocol_fee_destination: &'me AccountInfo<'a8>,
    pub clock: &'me AccountInfo<'a9>,
    pub stake_program: &'me AccountInfo<'a10>,
    pub system_program: &'me AccountInfo<'a11>,
    pub token_program: &'me AccountInfo<'a12>,
}
#[derive(Copy, Clone, Debug)]
pub struct UnstakeWsolKeys {
    pub unstaker: Pubkey,
    pub stake_account: Pubkey,
    pub destination: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub fee_account: Pubkey,
    pub stake_account_record_account: Pubkey,
    pub protocol_fee_account: Pubkey,
    pub protocol_fee_destination: Pubkey,
    pub clock: Pubkey,
    pub stake_program: Pubkey,
    pub system_program: Pubkey,
    pub token_program: Pubkey,
}
impl<'me> From<&UnstakeWsolAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_>>
    for UnstakeWsolKeys
{
    fn from(
        accounts: &UnstakeWsolAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_, '_>,
    ) -> Self {
        Self {
            unstaker: *accounts.unstaker.key,
            stake_account: *accounts.stake_account.key,
            destination: *accounts.destination.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            fee_account: *accounts.fee_account.key,
            stake_account_record_account: *accounts.stake_account_record_account.key,
            protocol_fee_account: *accounts.protocol_fee_account.key,
            protocol_fee_destination: *accounts.protocol_fee_destination.key,
            clock: *accounts.clock.key,
            stake_program: *accounts.stake_program.key,
            system_program: *accounts.system_program.key,
            token_program: *accounts.token_program.key,
        }
    }
}
impl From<&UnstakeWsolKeys> for [AccountMeta; UNSTAKE_WSOL_IX_ACCOUNTS_LEN] {
    fn from(keys: &UnstakeWsolKeys) -> Self {
        [
            AccountMeta::new_readonly(keys.unstaker, true),
            AccountMeta::new(keys.stake_account, false),
            AccountMeta::new(keys.destination, false),
            AccountMeta::new(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new_readonly(keys.fee_account, false),
            AccountMeta::new(keys.stake_account_record_account, false),
            AccountMeta::new_readonly(keys.protocol_fee_account, false),
            AccountMeta::new(keys.protocol_fee_destination, false),
            AccountMeta::new_readonly(keys.clock, false),
            AccountMeta::new_readonly(keys.stake_program, false),
            AccountMeta::new_readonly(keys.system_program, false),
            AccountMeta::new_readonly(keys.token_program, false),
        ]
    }
}
impl<'a> From<&UnstakeWsolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; UNSTAKE_WSOL_IX_ACCOUNTS_LEN]
{
    fn from(
        accounts: &UnstakeWsolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    ) -> Self {
        [
            accounts.unstaker.clone(),
            accounts.stake_account.clone(),
            accounts.destination.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.fee_account.clone(),
            accounts.stake_account_record_account.clone(),
            accounts.protocol_fee_account.clone(),
            accounts.protocol_fee_destination.clone(),
            accounts.clock.clone(),
            accounts.stake_program.clone(),
            accounts.system_program.clone(),
            accounts.token_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct UnstakeWsolIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct UnstakeWsolIxData<'me>(pub &'me UnstakeWsolIxArgs);
pub const UNSTAKE_WSOL_IX_DISCM: [u8; 8] = [125, 93, 190, 135, 89, 174, 142, 149];
impl<'me> From<&'me UnstakeWsolIxArgs> for UnstakeWsolIxData<'me> {
    fn from(args: &'me UnstakeWsolIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for UnstakeWsolIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&UNSTAKE_WSOL_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn unstake_wsol_ix<K: Into<UnstakeWsolKeys>, A: Into<UnstakeWsolIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: UnstakeWsolKeys = accounts.into();
    let metas: [AccountMeta; UNSTAKE_WSOL_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: UnstakeWsolIxArgs = args.into();
    let data: UnstakeWsolIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn unstake_wsol_invoke<'a, A: Into<UnstakeWsolIxArgs>>(
    accounts: &UnstakeWsolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = unstake_wsol_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; UNSTAKE_WSOL_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn unstake_wsol_invoke_signed<'a, A: Into<UnstakeWsolIxArgs>>(
    accounts: &UnstakeWsolAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = unstake_wsol_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; UNSTAKE_WSOL_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const SET_FLASH_LOAN_FEE_IX_ACCOUNTS_LEN: usize = 5usize;
#[derive(Copy, Clone, Debug)]
pub struct SetFlashLoanFeeAccounts<'me, 'a0: 'me, 'a1: 'me, 'a2: 'me, 'a3: 'me, 'a4: 'me> {
    pub payer: &'me AccountInfo<'a0>,
    pub fee_authority: &'me AccountInfo<'a1>,
    pub pool_account: &'me AccountInfo<'a2>,
    pub flash_loan_fee_account: &'me AccountInfo<'a3>,
    pub system_program: &'me AccountInfo<'a4>,
}
#[derive(Copy, Clone, Debug)]
pub struct SetFlashLoanFeeKeys {
    pub payer: Pubkey,
    pub fee_authority: Pubkey,
    pub pool_account: Pubkey,
    pub flash_loan_fee_account: Pubkey,
    pub system_program: Pubkey,
}
impl<'me> From<&SetFlashLoanFeeAccounts<'me, '_, '_, '_, '_, '_>> for SetFlashLoanFeeKeys {
    fn from(accounts: &SetFlashLoanFeeAccounts<'me, '_, '_, '_, '_, '_>) -> Self {
        Self {
            payer: *accounts.payer.key,
            fee_authority: *accounts.fee_authority.key,
            pool_account: *accounts.pool_account.key,
            flash_loan_fee_account: *accounts.flash_loan_fee_account.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<&SetFlashLoanFeeKeys> for [AccountMeta; SET_FLASH_LOAN_FEE_IX_ACCOUNTS_LEN] {
    fn from(keys: &SetFlashLoanFeeKeys) -> Self {
        [
            AccountMeta::new(keys.payer, true),
            AccountMeta::new_readonly(keys.fee_authority, true),
            AccountMeta::new_readonly(keys.pool_account, false),
            AccountMeta::new(keys.flash_loan_fee_account, false),
            AccountMeta::new_readonly(keys.system_program, false),
        ]
    }
}
impl<'a> From<&SetFlashLoanFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; SET_FLASH_LOAN_FEE_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &SetFlashLoanFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.payer.clone(),
            accounts.fee_authority.clone(),
            accounts.pool_account.clone(),
            accounts.flash_loan_fee_account.clone(),
            accounts.system_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct SetFlashLoanFeeIxArgs {
    pub flash_loan_fee: FlashLoanFee,
}
#[derive(Copy, Clone, Debug)]
pub struct SetFlashLoanFeeIxData<'me>(pub &'me SetFlashLoanFeeIxArgs);
pub const SET_FLASH_LOAN_FEE_IX_DISCM: [u8; 8] = [21, 27, 137, 29, 226, 149, 221, 100];
impl<'me> From<&'me SetFlashLoanFeeIxArgs> for SetFlashLoanFeeIxData<'me> {
    fn from(args: &'me SetFlashLoanFeeIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for SetFlashLoanFeeIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&SET_FLASH_LOAN_FEE_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn set_flash_loan_fee_ix<K: Into<SetFlashLoanFeeKeys>, A: Into<SetFlashLoanFeeIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: SetFlashLoanFeeKeys = accounts.into();
    let metas: [AccountMeta; SET_FLASH_LOAN_FEE_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: SetFlashLoanFeeIxArgs = args.into();
    let data: SetFlashLoanFeeIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn set_flash_loan_fee_invoke<'a, A: Into<SetFlashLoanFeeIxArgs>>(
    accounts: &SetFlashLoanFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = set_flash_loan_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_FLASH_LOAN_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn set_flash_loan_fee_invoke_signed<'a, A: Into<SetFlashLoanFeeIxArgs>>(
    accounts: &SetFlashLoanFeeAccounts<'_, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = set_flash_loan_fee_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; SET_FLASH_LOAN_FEE_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const TAKE_FLASH_LOAN_IX_ACCOUNTS_LEN: usize = 6usize;
#[derive(Copy, Clone, Debug)]
pub struct TakeFlashLoanAccounts<'me, 'a0: 'me, 'a1: 'me, 'a2: 'me, 'a3: 'me, 'a4: 'me, 'a5: 'me> {
    pub receiver: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub pool_sol_reserves: &'me AccountInfo<'a2>,
    pub flash_account: &'me AccountInfo<'a3>,
    pub system_program: &'me AccountInfo<'a4>,
    pub instructions: &'me AccountInfo<'a5>,
}
#[derive(Copy, Clone, Debug)]
pub struct TakeFlashLoanKeys {
    pub receiver: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub flash_account: Pubkey,
    pub system_program: Pubkey,
    pub instructions: Pubkey,
}
impl<'me> From<&TakeFlashLoanAccounts<'me, '_, '_, '_, '_, '_, '_>> for TakeFlashLoanKeys {
    fn from(accounts: &TakeFlashLoanAccounts<'me, '_, '_, '_, '_, '_, '_>) -> Self {
        Self {
            receiver: *accounts.receiver.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            flash_account: *accounts.flash_account.key,
            system_program: *accounts.system_program.key,
            instructions: *accounts.instructions.key,
        }
    }
}
impl From<&TakeFlashLoanKeys> for [AccountMeta; TAKE_FLASH_LOAN_IX_ACCOUNTS_LEN] {
    fn from(keys: &TakeFlashLoanKeys) -> Self {
        [
            AccountMeta::new(keys.receiver, false),
            AccountMeta::new_readonly(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new(keys.flash_account, false),
            AccountMeta::new_readonly(keys.system_program, false),
            AccountMeta::new_readonly(keys.instructions, false),
        ]
    }
}
impl<'a> From<&TakeFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; TAKE_FLASH_LOAN_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &TakeFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.receiver.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.flash_account.clone(),
            accounts.system_program.clone(),
            accounts.instructions.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct TakeFlashLoanIxArgs {
    pub lamports: u64,
}
#[derive(Copy, Clone, Debug)]
pub struct TakeFlashLoanIxData<'me>(pub &'me TakeFlashLoanIxArgs);
pub const TAKE_FLASH_LOAN_IX_DISCM: [u8; 8] = [64, 124, 6, 57, 151, 155, 26, 195];
impl<'me> From<&'me TakeFlashLoanIxArgs> for TakeFlashLoanIxData<'me> {
    fn from(args: &'me TakeFlashLoanIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for TakeFlashLoanIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&TAKE_FLASH_LOAN_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn take_flash_loan_ix<K: Into<TakeFlashLoanKeys>, A: Into<TakeFlashLoanIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: TakeFlashLoanKeys = accounts.into();
    let metas: [AccountMeta; TAKE_FLASH_LOAN_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: TakeFlashLoanIxArgs = args.into();
    let data: TakeFlashLoanIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn take_flash_loan_invoke<'a, A: Into<TakeFlashLoanIxArgs>>(
    accounts: &TakeFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = take_flash_loan_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; TAKE_FLASH_LOAN_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn take_flash_loan_invoke_signed<'a, A: Into<TakeFlashLoanIxArgs>>(
    accounts: &TakeFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = take_flash_loan_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; TAKE_FLASH_LOAN_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}
pub const REPAY_FLASH_LOAN_IX_ACCOUNTS_LEN: usize = 8usize;
#[derive(Copy, Clone, Debug)]
pub struct RepayFlashLoanAccounts<
    'me,
    'a0: 'me,
    'a1: 'me,
    'a2: 'me,
    'a3: 'me,
    'a4: 'me,
    'a5: 'me,
    'a6: 'me,
    'a7: 'me,
> {
    pub repayer: &'me AccountInfo<'a0>,
    pub pool_account: &'me AccountInfo<'a1>,
    pub pool_sol_reserves: &'me AccountInfo<'a2>,
    pub flash_account: &'me AccountInfo<'a3>,
    pub flash_loan_fee_account: &'me AccountInfo<'a4>,
    pub protocol_fee_account: &'me AccountInfo<'a5>,
    pub protocol_fee_destination: &'me AccountInfo<'a6>,
    pub system_program: &'me AccountInfo<'a7>,
}
#[derive(Copy, Clone, Debug)]
pub struct RepayFlashLoanKeys {
    pub repayer: Pubkey,
    pub pool_account: Pubkey,
    pub pool_sol_reserves: Pubkey,
    pub flash_account: Pubkey,
    pub flash_loan_fee_account: Pubkey,
    pub protocol_fee_account: Pubkey,
    pub protocol_fee_destination: Pubkey,
    pub system_program: Pubkey,
}
impl<'me> From<&RepayFlashLoanAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_>>
    for RepayFlashLoanKeys
{
    fn from(accounts: &RepayFlashLoanAccounts<'me, '_, '_, '_, '_, '_, '_, '_, '_>) -> Self {
        Self {
            repayer: *accounts.repayer.key,
            pool_account: *accounts.pool_account.key,
            pool_sol_reserves: *accounts.pool_sol_reserves.key,
            flash_account: *accounts.flash_account.key,
            flash_loan_fee_account: *accounts.flash_loan_fee_account.key,
            protocol_fee_account: *accounts.protocol_fee_account.key,
            protocol_fee_destination: *accounts.protocol_fee_destination.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<&RepayFlashLoanKeys> for [AccountMeta; REPAY_FLASH_LOAN_IX_ACCOUNTS_LEN] {
    fn from(keys: &RepayFlashLoanKeys) -> Self {
        [
            AccountMeta::new(keys.repayer, true),
            AccountMeta::new_readonly(keys.pool_account, false),
            AccountMeta::new(keys.pool_sol_reserves, false),
            AccountMeta::new(keys.flash_account, false),
            AccountMeta::new_readonly(keys.flash_loan_fee_account, false),
            AccountMeta::new_readonly(keys.protocol_fee_account, false),
            AccountMeta::new(keys.protocol_fee_destination, false),
            AccountMeta::new_readonly(keys.system_program, false),
        ]
    }
}
impl<'a> From<&RepayFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>>
    for [AccountInfo<'a>; REPAY_FLASH_LOAN_IX_ACCOUNTS_LEN]
{
    fn from(accounts: &RepayFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>) -> Self {
        [
            accounts.repayer.clone(),
            accounts.pool_account.clone(),
            accounts.pool_sol_reserves.clone(),
            accounts.flash_account.clone(),
            accounts.flash_loan_fee_account.clone(),
            accounts.protocol_fee_account.clone(),
            accounts.protocol_fee_destination.clone(),
            accounts.system_program.clone(),
        ]
    }
}
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
pub struct RepayFlashLoanIxArgs {}
#[derive(Copy, Clone, Debug)]
pub struct RepayFlashLoanIxData<'me>(pub &'me RepayFlashLoanIxArgs);
pub const REPAY_FLASH_LOAN_IX_DISCM: [u8; 8] = [119, 239, 18, 45, 194, 107, 31, 238];
impl<'me> From<&'me RepayFlashLoanIxArgs> for RepayFlashLoanIxData<'me> {
    fn from(args: &'me RepayFlashLoanIxArgs) -> Self {
        Self(args)
    }
}
impl BorshSerialize for RepayFlashLoanIxData<'_> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        writer.write_all(&REPAY_FLASH_LOAN_IX_DISCM)?;
        self.0.serialize(writer)
    }
}
pub fn repay_flash_loan_ix<K: Into<RepayFlashLoanKeys>, A: Into<RepayFlashLoanIxArgs>>(
    accounts: K,
    args: A,
) -> std::io::Result<Instruction> {
    let keys: RepayFlashLoanKeys = accounts.into();
    let metas: [AccountMeta; REPAY_FLASH_LOAN_IX_ACCOUNTS_LEN] = (&keys).into();
    let args_full: RepayFlashLoanIxArgs = args.into();
    let data: RepayFlashLoanIxData = (&args_full).into();
    Ok(Instruction {
        program_id: crate::ID,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn repay_flash_loan_invoke<'a, A: Into<RepayFlashLoanIxArgs>>(
    accounts: &RepayFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
) -> ProgramResult {
    let ix = repay_flash_loan_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; REPAY_FLASH_LOAN_IX_ACCOUNTS_LEN] = accounts.into();
    invoke(&ix, &account_info)
}
pub fn repay_flash_loan_invoke_signed<'a, A: Into<RepayFlashLoanIxArgs>>(
    accounts: &RepayFlashLoanAccounts<'_, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a>,
    args: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let ix = repay_flash_loan_ix(accounts, args)?;
    let account_info: [AccountInfo<'a>; REPAY_FLASH_LOAN_IX_ACCOUNTS_LEN] = accounts.into();
    invoke_signed(&ix, &account_info, seeds)
}

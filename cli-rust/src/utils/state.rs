use solana_account_decoder::parse_stake::{parse_stake, StakeAccountType};
use solana_account_decoder::UiAccountEncoding;
use solana_client::rpc_client::RpcClient;
use solana_client::{
    rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig},
    rpc_filter::{Memcmp, RpcFilterType},
};
use solana_program::pubkey::Pubkey;
use solana_sdk::{
    account::Account,
    commitment_config::{CommitmentConfig, CommitmentLevel},
};
use unstake::ID;

pub enum StakeState {
    Inactive,
    Activating,
    Active,
    Deactivating,
}

pub fn stake_account_state(
    stake_acc_with_record: &(Pubkey, Account),
    current_epoch: &u64,
) -> StakeState {
    let state = parse_stake(&stake_acc_with_record.1.data).unwrap();

    match state {
        StakeAccountType::Uninitialized | StakeAccountType::RewardsPool => StakeState::Inactive,
        StakeAccountType::Initialized(stake_account)
        | StakeAccountType::Delegated(stake_account) => {
            if let Some(stake) = stake_account.stake {
                let activation_epoch: u64 = stake.delegation.activation_epoch.parse().unwrap();
                let deactivation_epoch: u64 = stake.delegation.deactivation_epoch.parse().unwrap();

                match activation_epoch.cmp(current_epoch) {
                    std::cmp::Ordering::Greater => StakeState::Inactive,
                    std::cmp::Ordering::Equal => {
                        if deactivation_epoch == activation_epoch {
                            StakeState::Inactive
                        } else {
                            StakeState::Activating
                        }
                    }
                    std::cmp::Ordering::Less => match deactivation_epoch.cmp(current_epoch) {
                        std::cmp::Ordering::Greater => StakeState::Active,
                        std::cmp::Ordering::Equal => StakeState::Deactivating,
                        std::cmp::Ordering::Less => StakeState::Inactive,
                    },
                }
            } else {
                // If there's no stake information, it's inactive
                StakeState::Inactive
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct LiquidityPoolStakeAccounts {
    pub active: Vec<Pubkey>,
    pub inactive: Vec<Pubkey>,
    pub activating: Vec<Pubkey>,
    pub deactivating: Vec<Pubkey>,
}

const META_AUTHORIZED_WITHDRAWER_OFFSET: usize = 44;

pub fn fetch_liquidity_pool_stake_accounts(
    client: &RpcClient,
    pool_account: &Pubkey,
    pool_sol_reserves: &Pubkey,
) -> LiquidityPoolStakeAccounts {
    let stake_accounts = client
        .get_program_accounts_with_config(
            &solana_stake_program::id(),
            RpcProgramAccountsConfig {
                account_config: RpcAccountInfoConfig {
                    encoding: Some(UiAccountEncoding::Base64),
                    data_slice: None,
                    min_context_slot: None,
                    commitment: None,
                },
                filters: Some(vec![RpcFilterType::Memcmp(Memcmp::new_raw_bytes(
                    META_AUTHORIZED_WITHDRAWER_OFFSET,
                    pool_sol_reserves.as_ref().to_vec(),
                ))]),
                with_context: None,
            },
        )
        .unwrap();

    let stake_acc_record_keys = stake_accounts
        .iter()
        .map(|stake_account| {
            let stake_account_record_account = Pubkey::find_program_address(
                &[&pool_account.to_bytes(), &stake_account.0.to_bytes()],
                &ID,
            );
            stake_account_record_account.0
        })
        .collect::<Vec<_>>();

    let stake_accs_with_record = stake_accounts
        .iter()
        .enumerate()
        .filter_map(|(i, stake_account)| {
            if stake_acc_record_keys[i] != Pubkey::default() {
                Some(stake_account.clone())
            } else {
                None
            }
        })
        .collect::<Vec<(Pubkey, Account)>>();

    let current_epoch = client
        .get_epoch_info_with_commitment(CommitmentConfig {
            commitment: CommitmentLevel::Finalized,
        })
        .unwrap()
        .epoch;

    stake_accs_with_record.into_iter().fold(
        LiquidityPoolStakeAccounts {
            active: Vec::new(),
            inactive: Vec::new(),
            activating: Vec::new(),
            deactivating: Vec::new(),
        },
        |mut res, ksa| {
            let state = stake_account_state(&ksa, &current_epoch);
            match state {
                StakeState::Inactive => res.inactive.push(ksa.0),
                StakeState::Activating => res.activating.push(ksa.0),
                StakeState::Active => res.active.push(ksa.0),
                StakeState::Deactivating => res.deactivating.push(ksa.0),
            }
            res
        },
    )
}

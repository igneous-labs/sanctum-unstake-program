use anchor_lang::prelude::*;
use core::mem::size_of;

pub trait AnchorLen {
    const LEN: usize;
}

impl<T: AccountSerialize + AccountSerialize> AnchorLen for T {
    /// TODO: this may overallocate space due to padding
    const LEN: usize = 8 + size_of::<Self>();
}

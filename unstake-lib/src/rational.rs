use spl_math::precise_number::PreciseNumber;
use unstake_interface::Rational;

pub trait RationalQty {
    fn is_valid(&self) -> bool;

    fn to_precise_number(&self) -> Option<PreciseNumber>;

    fn is_lte_one(&self) -> bool;

    fn floor_mul(&self, value: u64) -> Option<u64>;

    fn ceil_mul(&self, value: u64) -> Option<u64>;
}

impl<T: RationalQty + ?Sized> RationalQty for &T {
    fn is_valid(&self) -> bool {
        (*self).is_valid()
    }

    fn to_precise_number(&self) -> Option<PreciseNumber> {
        (*self).to_precise_number()
    }

    fn is_lte_one(&self) -> bool {
        (*self).is_lte_one()
    }

    fn floor_mul(&self, value: u64) -> Option<u64> {
        (*self).floor_mul(value)
    }

    fn ceil_mul(&self, value: u64) -> Option<u64> {
        (*self).ceil_mul(value)
    }
}

impl RationalQty for Rational {
    fn is_valid(&self) -> bool {
        self.denom != 0
    }

    fn to_precise_number(&self) -> Option<PreciseNumber> {
        PreciseNumber::new(self.num as u128)?.checked_div(&PreciseNumber::new(self.denom as u128)?)
    }

    fn is_lte_one(&self) -> bool {
        self.num <= self.denom
    }

    fn floor_mul(&self, value: u64) -> Option<u64> {
        u128::from(value)
            .checked_mul(self.num.into())
            .and_then(|product| product.checked_div(self.denom.into()))
            .and_then(|result| result.try_into().ok())
    }

    fn ceil_mul(&self, value: u64) -> Option<u64> {
        u128::from(value)
            .checked_mul(self.num.into())
            .and_then(|product| product.checked_add(self.denom.into()))
            .and_then(|rounded_up| rounded_up.checked_sub(1))
            .and_then(|rounded_up_sub_one| rounded_up_sub_one.checked_div(self.denom.into()))
            .and_then(|result| result.try_into().ok())
    }
}

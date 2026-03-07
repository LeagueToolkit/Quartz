pub fn elf<B: AsRef<[u8]>>(input: B) -> usize {
    let input = input.as_ref();
    let mut hash = 0;
    let mut high;
    for b in input {
        hash = (hash << 4) + (*b as usize);
        high = hash & 0xF0000000;
        if high != 0 {
            hash ^= high >> 24;
        }
        hash &= !high;
    }
    hash
}

#[cfg(test)]
mod tests {
    #[test]
    fn elf() {
        assert_eq!(
            super::elf("jdfgsdhfsdfsd 6445dsfsd7fg/*/+bfjsdgf%$^"),
            248446350
        );
    }
}

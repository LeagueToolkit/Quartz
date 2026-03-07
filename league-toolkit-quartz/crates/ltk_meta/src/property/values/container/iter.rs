use crate::{
    property::values::{self},
    traits::PropertyValueDyn,
    PropertyValueEnum,
};

pub struct ItemsDyn<'a, M>(ItemsDynInner<'a, M>);
impl<'a, M> Iterator for ItemsDyn<'a, M> {
    type Item = &'a dyn PropertyValueDyn;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next()
    }
}
impl<'a, M> From<ItemsDynInner<'a, M>> for ItemsDyn<'a, M> {
    fn from(value: ItemsDynInner<'a, M>) -> Self {
        Self(value)
    }
}

pub struct IntoItems<M>(IntoItemsInner<M>);
impl<M> Iterator for IntoItems<M> {
    type Item = PropertyValueEnum<M>;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next()
    }
}
impl<M> From<IntoItemsInner<M>> for IntoItems<M> {
    fn from(value: IntoItemsInner<M>) -> Self {
        Self(value)
    }
}

macro_rules! define_dyn_iter {
    ( [$( $variant:ident, )*] ) => {
        pub(super) enum ItemsDynInner<'a, M> {
            $($variant(std::slice::Iter<'a, values::$variant<M>>),)*
        }

        impl<'a, M> Iterator for ItemsDynInner<'a, M> {
            type Item = &'a dyn PropertyValueDyn;

            fn next(&mut self) -> Option<Self::Item> {
                match self {
                    $(Self::$variant(it) => it.next().map(|x| x as _),)*
                }
            }
        }

        $(
            impl<'a, M> From<std::slice::Iter<'a, values::$variant<M>>> for ItemsDynInner<'a, M> {
                fn from(other: std::slice::Iter<'a, values::$variant<M>>) -> Self {
                    Self::$variant(other)
                }
            }
        )*


        pub(super) enum IntoItemsInner<M> {
            $($variant(std::vec::IntoIter<values::$variant<M>>),)*
        }
        impl<M> Iterator for IntoItemsInner<M> {
            type Item = PropertyValueEnum<M>;

            fn next(&mut self) -> Option<Self::Item> {
                match self {
                    $(Self::$variant(it) => it.next().map(|x| x.into()),)*
                }
            }
        }

        $(
            impl<M> From<std::vec::IntoIter<values::$variant<M>>> for IntoItemsInner<M> {
                fn from(other: std::vec::IntoIter<values::$variant<M>>) -> Self {
                    Self::$variant(other)
                }
            }
        )*

    };
}

container_variants!(define_dyn_iter);

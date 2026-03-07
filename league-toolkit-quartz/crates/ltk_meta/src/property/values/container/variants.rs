macro_rules! container_variants {
    ($macro:ident $(, $args:tt)*) => {
        $macro! {
            $( $args )*
            [
                None,
                U8, U16, U32, U64,
                I8, I16, I32, I64,
                F32,
                Vector2, Vector3, Vector4,
                Matrix44,
                Bool,
                Color,
                String,
                Hash,
                WadChunkLink,
                Struct,
                Embedded,
                ObjectLink,
                BitBool,
            ]
        }
    };
}

macro_rules! match_property {
    ($value:expr, $on:ident, $inner:pat => $body:expr, $def:pat => $def_body: expr) => {
        container_variants!(match_property_arms, ($value, $on, $inner => $body, $def => $def_body))
    };
    ($value:expr, $on:ident, $inner:pat => $body:expr) => {
        container_variants!(match_property_arms, ($value, $on, $inner => $body))
    };

    ($value:expr, $inner:pat => $body:expr, $def:pat => $def_body: expr) => {
        container_variants!(match_property_arms, ($value, Self, $inner => $body, $def => $def_body))
    };
    ($value:expr, $inner:pat => $body:expr) => {
        container_variants!(match_property_arms, ($value, Self, $inner => $body))
    };
}

macro_rules! match_property_arms {
    (($value:expr, $on:ident, $inner:pat => $body:expr, $def:pat => $def_body: expr)
     [$( $variant:ident, )*]) => {
        match $value {
            $(
                $on::$variant($inner) => $body,
            )*
            $def => $def_body
        }
    };

    (($value:expr, $on:ident, $inner:pat => $body:expr)
     [$( $variant:ident, )*]) => {
        match $value {
            $(
                $on::$variant($inner) => $body,
            )*
        }
    };
}

// macro_rules! match_enum_inner {
//     (($value:expr, $on:ident, ||, $body:expr)
//      [$( $variant:ident, )*] ) => {
//         match $value {
//             $(
//                 $on::$variant => $body,
//             )*
//         }
//     };
//     (($value:expr, $on:ident, |$inner:ident| $body:expr)
//      [$( $variant:ident, )*] ) => {
//         match $value {
//             $(
//                 $on::$variant($inner) => $body,
//             )*
//         }
//     };
// }
// macro_rules! match_enum {
//     ($value:expr, $on:ident, ||, $body:expr) => {
//         variants!(match_enum_inner, ($value, $on, $body))
//     };
//     ($value:expr, $on:ident, |$inner:ident| $body:expr) => {
//         variants!(match_enum_inner, ($value, $on, |$inner| $body))
//     };
// }

macro_rules! property_kinds {
    (($value:expr)
     [$( $variant:ident, )*] ) => {
        match $value {
            $(
                Self::$variant {..} => <crate::property::values::$variant>::KIND,
            )*
        }
    };
}

/**
 * Flint - File Icons (VS Code Symbols Style)
 * High-quality SVG icons from vscode-symbols
 */

// =============================================================================
// SVG Icon Definitions - VS Code Symbols Style (24x24 viewBox)
// =============================================================================

export const icons = {
    // -------------------------------------------------------------------------
    // Chevron/Expander Icons
    // -------------------------------------------------------------------------
    chevronRight: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4l4 4-4 4" stroke="#848484" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chevronDown: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6l4 4 4-4" stroke="#848484" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

    // -------------------------------------------------------------------------
    // Folder Icons - VS Code style (outline, not filled)
    // -------------------------------------------------------------------------
    folder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.78388 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9.875C21 8.77043 20.1046 7.875 19 7.875H12.7161C12.2531 7.875 11.8044 7.71435 11.4466 7.42045L9.05336 5.45455C8.69558 5.16065 8.2469 5 7.78388 5Z" stroke="#64748B" stroke-width="1.5" fill="none"/></svg>`,
    folderOpen: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.78388 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9.875C21 8.77043 20.1046 7.875 19 7.875H12.7161C12.2531 7.875 11.8044 7.71435 11.4466 7.42045L9.05336 5.45455C8.69558 5.16065 8.2469 5 7.78388 5Z" stroke="#64748B" stroke-width="1.5" fill="none"/></svg>`,

    // -------------------------------------------------------------------------
    // Default File Icon
    // -------------------------------------------------------------------------
    file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V8C19 7.69622 18.8619 7.4089 18.6247 7.21913L13.6247 3.21913C13.4474 3.07728 13.2271 3 13 3H6Z" stroke="#64748B" stroke-width="2" stroke-linejoin="round"/><path d="M12 4V9H18" stroke="#64748B" stroke-width="2" stroke-linejoin="round"/></svg>`,

    // -------------------------------------------------------------------------
    // JavaScript / TypeScript / React
    // -------------------------------------------------------------------------
    javascript: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.38255 7.31818H10.5104V14.4176C10.5104 15.0739 10.3629 15.6439 10.0679 16.1278C9.77625 16.6117 9.37024 16.9846 8.84988 17.2464C8.32952 17.5083 7.72464 17.6392 7.03525 17.6392C6.42208 17.6392 5.86526 17.5315 5.36479 17.3161C4.86763 17.0973 4.47322 16.7659 4.18155 16.3217C3.88989 15.8743 3.74571 15.3125 3.74902 14.6364H5.89178C5.89841 14.9048 5.9531 15.1352 6.05584 15.3274C6.1619 15.5163 6.30608 15.6622 6.48837 15.7649C6.67398 15.8643 6.89273 15.9141 7.14462 15.9141C7.40977 15.9141 7.63349 15.8577 7.81578 15.745C8.00139 15.629 8.14225 15.46 8.23837 15.2379C8.33449 15.0159 8.38255 14.7424 8.38255 14.4176V7.31818ZM17.8137 10.2464C17.7739 9.84541 17.6032 9.53385 17.3016 9.31179C17 9.08972 16.5906 8.97869 16.0736 8.97869C15.7223 8.97869 15.4256 9.02841 15.1837 9.12784C14.9417 9.22396 14.7561 9.35819 14.6269 9.53054C14.5009 9.70289 14.4379 9.89844 14.4379 10.1172C14.4313 10.2995 14.4694 10.4586 14.5523 10.5945C14.6385 10.7304 14.7561 10.848 14.9053 10.9474C15.0544 11.0436 15.2268 11.1281 15.4223 11.201C15.6179 11.2706 15.8267 11.3303 16.0487 11.38L16.9635 11.5987C17.4076 11.6982 17.8153 11.8307 18.1865 11.9964C18.5577 12.1622 18.8792 12.366 19.151 12.608C19.4228 12.8499 19.6333 13.1349 19.7824 13.4631C19.9349 13.7912 20.0128 14.1674 20.0161 14.5916C20.0128 15.2147 19.8537 15.755 19.5388 16.2124C19.2272 16.6664 18.7765 17.0194 18.1865 17.2713C17.5999 17.5199 16.8923 17.6442 16.0637 17.6442C15.2417 17.6442 14.5258 17.5182 13.9159 17.2663C13.3094 17.0144 12.8354 16.6416 12.4941 16.1477C12.156 15.6506 11.9787 15.0357 11.9621 14.3033H14.0452C14.0684 14.6446 14.1662 14.9297 14.3385 15.1584C14.5142 15.3838 14.7478 15.5545 15.0395 15.6705C15.3345 15.7831 15.6676 15.8395 16.0388 15.8395C16.4034 15.8395 16.7199 15.7865 16.9884 15.6804C17.2602 15.5743 17.4706 15.4268 17.6198 15.2379C17.7689 15.049 17.8435 14.8319 17.8435 14.5866C17.8435 14.358 17.7755 14.1657 17.6396 14.0099C17.5071 13.8542 17.3115 13.7216 17.053 13.6122C16.7978 13.5028 16.4846 13.4034 16.1134 13.3139L15.0047 13.0355C14.1463 12.8267 13.4685 12.5002 12.9713 12.0561C12.4742 11.612 12.2272 11.0137 12.2306 10.2614C12.2272 9.64489 12.3913 9.1063 12.7227 8.6456C13.0575 8.1849 13.5165 7.82528 14.0999 7.56676C14.6832 7.30824 15.3461 7.17898 16.0885 7.17898C16.8442 7.17898 17.5038 7.30824 18.0672 7.56676C18.634 7.82528 19.0748 8.1849 19.3896 8.6456C19.7045 9.1063 19.8669 9.63991 19.8769 10.2464H17.8137Z" fill="#F59E0B"/></svg>`,
    typescript: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.23446 9.09304V7.31818H11.5967V9.09304H8.47949V17.5H6.35165V9.09304H3.23446ZM18.4972 10.2464C18.4575 9.84541 18.2868 9.53385 17.9852 9.31179C17.6836 9.08972 17.2742 8.97869 16.7572 8.97869C16.4059 8.97869 16.1092 9.02841 15.8673 9.12784C15.6253 9.22396 15.4397 9.35819 15.3105 9.53054C15.1845 9.70289 15.1215 9.89844 15.1215 10.1172C15.1149 10.2995 15.153 10.4586 15.2359 10.5945C15.3221 10.7304 15.4397 10.848 15.5889 10.9474C15.738 11.0436 15.9104 11.1281 16.1059 11.201C16.3015 11.2706 16.5103 11.3303 16.7323 11.38L17.6471 11.5987C18.0912 11.6982 18.4989 11.8307 18.8701 11.9964C19.2413 12.1622 19.5628 12.366 19.8346 12.608C20.1064 12.8499 20.3169 13.1349 20.466 13.4631C20.6185 13.7912 20.6963 14.1674 20.6997 14.5916C20.6963 15.2147 20.5373 15.755 20.2224 16.2124C19.9108 16.6664 19.4601 17.0194 18.8701 17.2713C18.2835 17.5199 17.5758 17.6442 16.7472 17.6442C15.9253 17.6442 15.2094 17.5182 14.5995 17.2663C13.993 17.0144 13.519 16.6416 13.1776 16.1477C12.8396 15.6506 12.6623 15.0357 12.6457 14.3033H14.7288C14.752 14.6446 14.8498 14.9297 15.0221 15.1584C15.1978 15.3838 15.4314 15.5545 15.7231 15.6705C16.0181 15.7831 16.3512 15.8395 16.7224 15.8395C17.087 15.8395 17.4035 15.7865 17.672 15.6804C17.9437 15.5743 18.1542 15.4268 18.3034 15.2379C18.4525 15.049 18.5271 14.8319 18.5271 14.5866C18.5271 14.358 18.4591 14.1657 18.3232 14.0099C18.1907 13.8542 17.9951 13.7216 17.7366 13.6122C17.4814 13.5028 17.1682 13.4034 16.797 13.3139L15.6883 13.0355C14.8299 12.8267 14.1521 12.5002 13.6549 12.0561C13.1578 11.612 12.9108 11.0137 12.9142 10.2614C12.9108 9.64489 13.0749 9.1063 13.4063 8.6456C13.7411 8.1849 14.2001 7.82528 14.7835 7.56676C15.3668 7.30824 16.0297 7.17898 16.7721 7.17898C17.5278 7.17898 18.1874 7.30824 18.7508 7.56676C19.3176 7.82528 19.7584 8.1849 20.0732 8.6456C20.3881 9.1063 20.5505 9.63991 20.5605 10.2464H18.4972Z" fill="#2563EB"/></svg>`,
    react: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 13.6773C12.9263 13.6773 13.6773 12.9263 13.6773 12C13.6773 11.0737 12.9263 10.3227 12 10.3227C11.0737 10.3227 10.3227 11.0737 10.3227 12C10.3227 12.9263 11.0737 13.6773 12 13.6773Z" fill="#38BDF8"/><path d="M12 15.4364C16.9706 15.4364 21 13.8979 21 12C21 10.1022 16.9706 8.56366 12 8.56366C7.02944 8.56366 3 10.1022 3 12C3 13.8979 7.02944 15.4364 12 15.4364Z" stroke="#38BDF8"/><path d="M9.02403 13.7182C11.5093 18.0228 14.8564 20.7432 16.5 19.7942C18.1436 18.8453 17.4613 14.5865 14.976 10.2818C12.4907 5.9772 9.14359 3.25687 7.5 4.20579C5.85642 5.15472 6.53875 9.41357 9.02403 13.7182Z" stroke="#38BDF8"/><path d="M9.02403 10.2818C6.53875 14.5865 5.85642 18.8453 7.5 19.7943C9.14359 20.7432 12.4907 18.0228 14.976 13.7182C17.4613 9.41358 18.1436 5.15472 16.5 4.2058C14.8564 3.25687 11.5093 5.97721 9.02403 10.2818Z" stroke="#38BDF8"/></svg>`,

    // -------------------------------------------------------------------------
    // Data & Config Files
    // -------------------------------------------------------------------------
    json: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.53267 5.86364H9.28835L11.9418 10.875H12.0554L14.7088 5.86364H17.4645L13.2202 13.3864V17.5H10.777V13.3864L6.53267 5.86364Z" fill="#FBBF24"/></svg>`,
    markdown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 15.7143V8H5.32258L7.64516 10.8361L9.96774 8H12.2903V15.7143H9.96774V11.2899L7.64516 14.1261L5.32258 11.2899V15.7143H3ZM17.5161 15.7143L14.0323 11.9706H16.3548V8H18.6774V11.9706H21L17.5161 15.7143Z" fill="#60A5FA"/></svg>`,
    config: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.93871 5.3696C6.53094 7.4206 5.29981 9.55287 3.22737 10.0657L2.1283 10.3376C2.04383 10.8788 2 11.4342 2 12.0001C2 12.5921 2.04797 13.1725 2.14034 13.7373L3.15512 13.9817C5.24827 14.4859 6.49237 16.64 5.88302 18.7047L5.53253 19.8924C6.3588 20.6178 7.30021 21.207 8.32477 21.626L9.25282 20.6501C10.7362 19.0902 13.2239 19.0905 14.7069 20.6511L15.6451 21.6384C16.6676 21.2239 17.6083 20.6404 18.4347 19.921L18.0622 18.6306C17.47 16.5794 18.7011 14.4471 20.7736 13.9344L21.8717 13.6626C21.9562 13.1213 22 12.566 22 12.0001C22 11.408 21.952 10.8275 21.8597 10.2625L20.8456 10.0183C18.7527 9.51431 17.5086 7.36021 18.1179 5.29529L18.468 4.10856C17.6419 3.38275 16.7004 2.79352 15.6758 2.37436L14.7481 3.34982C13.2647 4.90999 10.7771 4.90943 9.29402 3.34888L8.35562 2.36157C7.33313 2.77584 6.39248 3.35923 5.56602 4.07864L5.93871 5.3696ZM12.0001 14.822C10.4937 14.822 9.27276 13.5586 9.27276 12.0001C9.27276 10.4416 10.4937 9.17812 12.0001 9.17812C13.5063 9.17812 14.7272 10.4416 14.7272 12.0001C14.7272 13.5586 13.5063 14.822 12.0001 14.822Z" fill="#64748B"/></svg>`,
    yaml: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.53267 5.86364H9.28835L11.9418 10.875H12.0554L14.7088 5.86364H17.4645L13.2202 13.3864V17.5H10.777V13.3864L6.53267 5.86364Z" fill="#A78BFA"/></svg>`,

    // -------------------------------------------------------------------------
    // Image Files
    // -------------------------------------------------------------------------
    image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" stroke="#C084FC" stroke-width="2" stroke-linejoin="round"/><circle cx="15" cy="9" r="2" fill="#C084FC"/><path d="M5 19L10.5858 13.4142C11.3668 12.6332 12.6332 12.6332 13.4142 13.4142L19 19" stroke="#C084FC" stroke-width="2" stroke-linejoin="round"/></svg>`,
    texture: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="6" height="6" fill="#26a69a" opacity="0.4"/><rect x="14" y="4" width="6" height="6" fill="#26a69a"/><rect x="4" y="14" width="6" height="6" fill="#26a69a"/><rect x="14" y="14" width="6" height="6" fill="#26a69a" opacity="0.4"/></svg>`,

    // -------------------------------------------------------------------------
    // League of Legends Specific
    // -------------------------------------------------------------------------
    bin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" stroke="#e67e22" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#e67e22"/><path d="M12 4v3m0 10v3m-8-8h3m10 0h3" stroke="#e67e22" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    model: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3L3 8v8l9 5 9-5V8L12 3z" stroke="#ab47bc" stroke-width="1.5" fill="none"/><path d="M3 8l9 5 9-5M12 13v8" stroke="#ab47bc" stroke-width="1.5"/></svg>`,
    skeleton: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="5" r="2.5" fill="#78909c"/><path d="M12 7.5v6m-5-3h10m-8 5l-2 5m8-5l2 5" stroke="#78909c" stroke-width="2" stroke-linecap="round"/></svg>`,
    animation: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 6H20V18H4V6ZM2 6C2 4.89543 2.89543 4 4 4H20C21.1046 4 22 4.89543 22 6V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V6ZM9.5 14.6162V9.38455C9.5 8.81499 10.1099 8.45328 10.6097 8.72641L15.3958 11.3419C15.9162 11.6263 15.9163 12.3737 15.3959 12.6582L10.6097 15.2743C10.1099 15.5475 9.5 15.1858 9.5 14.6162Z" fill="#ef5350"/></svg>`,
    wad: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="2" stroke="#8d6e63" stroke-width="2"/><path d="M6 9h12m-12 3h12m-12 3h9" stroke="#8d6e63" stroke-width="1.5"/></svg>`,

    // -------------------------------------------------------------------------
    // Web/Code Files
    // -------------------------------------------------------------------------
    html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 3l1.5 15 6.5 3 6.5-3 1.5-15H4z" fill="#e44d26"/><path d="M12 6v11l3.5-1.5 1-9H7.5l.3 3h5.7l-.3 4L12 14" stroke="#fff" stroke-width="1"/></svg>`,
    css: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 3l1.5 15 6.5 3 6.5-3 1.5-15H4z" fill="#42a5f5"/><path d="M12 6v11l3.5-1.5 1-9H7.5l.2 3h5.8l-.3 4L12 14" stroke="#fff" stroke-width="1"/></svg>`,
    text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="6" width="16" height="2" rx="1" fill="#64748B"/><rect x="4" y="11" width="12" height="2" rx="1" fill="#64748B"/><rect x="4" y="16" width="16" height="2" rx="1" fill="#64748B"/></svg>`,
    rust: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" stroke="#EA580C" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="#EA580C"/><path d="M12 4v2m0 12v2m-8-8h2m12 0h2m-3-5.5l-1.5 1.5m-7 7l-1.5 1.5m10 0l-1.5-1.5m-7-7l-1.5-1.5" stroke="#EA580C" stroke-width="1" stroke-linecap="round"/></svg>`,
    python: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.6217 21.3218C14.0212 21.4328 13.3384 21.4964 12.6233 21.4999C11.908 21.5033 11.1627 21.4472 10.4441 21.3224C9.30845 21.1238 8.35217 20.236 8.35217 19.0532V14.8974C8.35217 13.6795 9.28115 12.6803 10.4441 12.6803H14.6218C16.0403 12.6803 17.2348 11.409 17.2348 9.96834V7.97425H18.673C19.8885 7.97425 20.5986 8.8943 20.896 10.1865C21.297 11.9217 21.28 12.9603 20.896 14.6223C20.5637 16.072 19.4985 16.8345 18.283 16.8345H16.7136H12.5313V17.3889H16.7136V19.0526C16.7136 20.3125 16.3923 20.9954 14.6217 21.3218ZM14.446 18.4845C13.9139 18.4845 13.4825 18.9346 13.4825 19.4899C13.4825 20.0451 13.9139 20.4953 14.446 20.4953C14.9781 20.4953 15.4095 20.0451 15.4095 19.4899C15.4095 18.9346 14.9781 18.4845 14.446 18.4845Z" fill="#14B8A6"/><path fill-rule="evenodd" clip-rule="evenodd" d="M9.37835 2.67823C9.9788 2.56725 10.6616 2.50361 11.3767 2.50015C12.092 2.49673 12.8373 2.55277 13.5559 2.67758C14.6916 2.87617 15.6478 3.76399 15.6478 4.94677V9.10261C15.6478 10.3205 14.7189 11.3197 13.5559 11.3197H9.3782C7.95969 11.3197 6.7652 12.591 6.7652 14.0317V16.0257H5.32703C4.11148 16.0257 3.40137 15.1057 3.10404 13.8135C2.70296 12.0783 2.71996 11.0397 3.10404 9.37771C3.43632 7.92797 4.50148 7.16549 5.71703 7.16549H7.28639H11.4688V6.61106H7.28639V4.94742C7.28639 3.68748 7.60775 3.00461 9.37835 2.67823ZM9.55398 5.51616C10.0861 5.51616 10.5175 5.06603 10.5175 4.51077C10.5175 3.95551 10.0861 3.50539 9.55398 3.50539C9.02186 3.50539 8.59049 3.95551 8.59049 4.51077C8.59049 5.06603 9.02186 5.51616 9.55398 5.51616Z" fill="#14B8A6"/></svg>`,
    shell: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 17L10 11L4 5" stroke="#14B8A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 19H20" stroke="#14B8A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    git: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.6613 11.1983L12.8016 3.33948C12.3493 2.88684 11.6153 2.88684 11.1625 3.33948L9.53048 4.97163L11.6006 7.04176C12.0819 6.87927 12.6335 6.98822 13.0169 7.37173C13.4023 7.75763 13.5105 8.31395 13.3439 8.79682L15.3392 10.7921C15.8219 10.6257 16.3788 10.7332 16.7643 11.1193C17.3032 11.658 17.3032 12.531 16.7643 13.0698C16.2253 13.6089 15.3524 13.6089 14.8131 13.0698C14.4079 12.6643 14.3077 12.069 14.5129 11.5697L12.6522 9.70896L12.652 14.6056C12.7834 14.6706 12.9074 14.7574 13.0168 14.8664C13.5556 15.4051 13.5556 16.2779 13.0168 16.8174C12.478 17.3561 11.6046 17.3561 11.0663 16.8174C10.5275 16.2779 10.5275 15.4051 11.0663 14.8664C11.1995 14.7335 11.3535 14.6329 11.5179 14.5655V9.62334C11.3535 9.55619 11.1996 9.45633 11.0662 9.32235C10.6581 8.91455 10.5598 8.31557 10.7691 7.8144L8.72837 5.77335L3.33959 11.162C2.8868 11.615 2.8868 12.349 3.33959 12.8017L11.1989 20.6605C11.6514 21.1132 12.3852 21.1132 12.8383 20.6605L20.6612 12.8388C21.1139 12.386 21.1139 11.6517 20.6612 11.1989" fill="#F87171"/></svg>`,
    video: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 6H20V18H4V6ZM2 6C2 4.89543 2.89543 4 4 4H20C21.1046 4 22 4.89543 22 6V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V6ZM9.5 14.6162V9.38455C9.5 8.81499 10.1099 8.45328 10.6097 8.72641L15.3958 11.3419C15.9162 11.6263 15.9163 12.3737 15.3959 12.6582L10.6097 15.2743C10.1099 15.5475 9.5 15.1858 9.5 14.6162Z" fill="#64748B"/></svg>`,
    audio: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="8" width="2" height="8" rx="1" fill="#64748B"/><rect x="7" y="6" width="2" height="12" rx="1" fill="#64748B"/><rect x="11" y="3" width="2" height="18" rx="1" fill="#64748B"/><rect x="15" y="6" width="2" height="12" rx="1" fill="#64748B"/><rect x="19" y="8" width="2" height="8" rx="1" fill="#64748B"/></svg>`,
    lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7 9.99986H17C18.6569 9.99986 20 11.343 20 12.9999V17.9999C20 19.6567 18.6569 20.9999 17 20.9999H7C5.34314 20.9999 4 19.6567 4 17.9999V12.9999C4 11.343 5.34315 9.99986 7 9.99986ZM7 11.9999C6.44772 11.9999 6 12.4476 6 12.9999V17.9999C6 18.5521 6.44772 18.9999 7 18.9999H17C17.5523 18.9999 18 18.5521 18 17.9999V12.9999C18 12.4476 17.5523 11.9999 17 11.9999H7Z" fill="#64748B"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.2689 4.93151C15.3544 3.61181 13.6806 3.07502 12.3531 3.0078C10.9524 2.93688 9.15252 3.34359 7.98517 4.84102C7.49028 5.47585 7.2821 6.24826 7.17477 6.82773C7.05797 7.45833 7.01207 8.1481 7.00214 8.81526C6.99154 9.52762 7.02146 10.2772 7.07178 10.9996H9.07693C8.93005 9.00977 8.94468 6.86318 9.5625 6.07066C10.8281 4.44717 13.7812 4.85304 14.625 6.07066C15.0474 6.68022 15.0469 8.91728 14.941 10.9996H16.9435C16.9827 10.2007 17.0069 9.37263 16.9983 8.60987C16.9911 7.97564 16.961 7.33892 16.8867 6.78085C16.8271 6.3334 16.6993 5.55268 16.2689 4.93151Z" fill="#64748B"/></svg>`,

    // -------------------------------------------------------------------------
    // UI Icons (for buttons, actions)
    // -------------------------------------------------------------------------
    plus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5.5" stroke="#60a5fa" stroke-width="1"/><path d="M8 7v4m0-6v.5" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5.5" stroke="#34d399" stroke-width="1"/><path d="M5.5 8l2 2 3-3.5" stroke="#34d399" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2l6 10H2L8 2z" stroke="#fbbf24" stroke-width="1" fill="none"/><path d="M8 6v3m0 2v.5" stroke="#fbbf24" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5.5" stroke="#f87171" stroke-width="1"/><path d="M5.5 5.5l5 5m0-5l-5 5" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    document: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V8C19 7.69622 18.8619 7.4089 18.6247 7.21913L13.6247 3.21913C13.4474 3.07728 13.2271 3 13 3H6Z" stroke="#64748B" stroke-width="2" stroke-linejoin="round"/><path d="M12 4V9H18" stroke="#64748B" stroke-width="2" stroke-linejoin="round"/></svg>`,
    settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.93871 5.3696C6.53094 7.4206 5.29981 9.55287 3.22737 10.0657L2.1283 10.3376C2.04383 10.8788 2 11.4342 2 12.0001C2 12.5921 2.04797 13.1725 2.14034 13.7373L3.15512 13.9817C5.24827 14.4859 6.49237 16.64 5.88302 18.7047L5.53253 19.8924C6.3588 20.6178 7.30021 21.207 8.32477 21.626L9.25282 20.6501C10.7362 19.0902 13.2239 19.0905 14.7069 20.6511L15.6451 21.6384C16.6676 21.2239 17.6083 20.6404 18.4347 19.921L18.0622 18.6306C17.47 16.5794 18.7011 14.4471 20.7736 13.9344L21.8717 13.6626C21.9562 13.1213 22 12.566 22 12.0001C22 11.408 21.952 10.8275 21.8597 10.2625L20.8456 10.0183C18.7527 9.51431 17.5086 7.36021 18.1179 5.29529L18.468 4.10856C17.6419 3.38275 16.7004 2.79352 15.6758 2.37436L14.7481 3.34982C13.2647 4.90999 10.7771 4.90943 9.29402 3.34888L8.35562 2.36157C7.33313 2.77584 6.39248 3.35923 5.56602 4.07864L5.93871 5.3696ZM12.0001 14.822C10.4937 14.822 9.27276 13.5586 9.27276 12.0001C9.27276 10.4416 10.4937 9.17812 12.0001 9.17812C13.5063 9.17812 14.7272 10.4416 14.7272 12.0001C14.7272 13.5586 13.5063 14.822 12.0001 14.822Z" fill="currentColor"/></svg>`,
    search: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.2"/><path d="M10 10l3.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    package: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5l6-3 6 3v6l-6 3-6-3V5z" stroke="currentColor" stroke-width="1"/><path d="M2 5l6 3 6-3M8 8v6" stroke="currentColor" stroke-width="1"/></svg>`,
    folderOpen2: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.78388 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9.875C21 8.77043 20.1046 7.875 19 7.875H12.7161C12.2531 7.875 11.8044 7.71435 11.4466 7.42045L9.05336 5.45455C8.69558 5.16065 8.2469 5 7.78388 5Z" stroke="#64748B" stroke-width="1.5" fill="none"/></svg>`,
    save: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 14H3c-.6 0-1-.4-1-1V3c0-.6.4-1 1-1h8l3 3v9c0 .6-.4 1-1 1z" stroke="currentColor" stroke-width="1"/><path d="M5 2v3h5V2m-5 12v-4h6v4" stroke="currentColor" stroke-width="1"/></svg>`,
    check: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    picture: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="15" cy="9" r="2" fill="currentColor"/><path d="M5 19L10.5858 13.4142C11.3668 12.6332 12.6332 12.6332 13.4142 13.4142L19 19" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    export: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2v7M5 6l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v2h12v-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="14" height="14" stroke="#52525B" stroke-width="1.5"/><rect x="3" y="3" width="4" height="4" rx="1" fill="#F472B6"/><rect x="17" y="3" width="4" height="4" rx="1" fill="#F472B6"/><rect x="17" y="17" width="4" height="4" rx="1" fill="#F472B6"/><rect x="3" y="17" width="4" height="4" rx="1" fill="#F472B6"/></svg>`,
    xml: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="19" r="2" fill="#EA580C"/><circle cx="5" cy="19" r="8" stroke="#EA580C" stroke-width="2" fill="none" clip-path="inset(0 0 0 4px)"/><circle cx="5" cy="19" r="15" stroke="#EA580C" stroke-width="2" fill="none" clip-path="inset(0 0 0 5px)"/></svg>`,
    tauri: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.1175 9.53548C15.1175 10.4794 14.3524 11.2445 13.4084 11.2445C12.4646 11.2445 11.6995 10.4794 11.6995 9.53548C11.6995 8.59169 12.4646 7.82654 13.4085 7.82654C14.3524 7.82654 15.1175 8.59163 15.1175 9.53548Z" fill="#EAB308"/><path d="M10.5342 12.7204C9.59033 12.7204 8.8252 13.4856 8.8252 14.4294C8.8252 15.3733 9.59033 16.1384 10.5342 16.1384C11.478 16.1384 12.2432 15.3733 12.2432 14.4294C12.2432 13.4856 11.478 12.7204 10.5342 12.7204Z" fill="#0891B2"/><path d="M16.9507 15.0121C16.2638 15.4562 15.4996 15.7671 14.698 15.9287C14.9303 15.2663 15.0074 14.5594 14.9232 13.8624C16.7888 13.2102 18.0262 11.4356 17.9934 9.45957C17.9603 7.48349 16.6645 5.75107 14.7781 5.16149C12.8918 4.57185 10.8399 5.25778 9.68747 6.86334C8.81794 6.96116 7.97178 7.20816 7.18616 7.59348C8.0397 4.83967 10.5993 2.97234 13.4823 3.00037C16.3653 3.0284 18.8881 4.94511 19.688 7.71506C20.4878 10.485 19.375 13.4516 16.9507 15.0121ZM7.26389 8.78198L8.86415 8.97619C8.90045 8.66714 8.96812 8.3626 9.06614 8.06728C8.43314 8.21444 7.8257 8.45533 7.26389 8.78198Z" fill="#EAB308"/><path d="M6.98422 8.95297C7.67519 8.50441 8.44485 8.19075 9.25253 8.02856C9.00822 8.69088 8.92047 9.40074 8.99618 10.1026C7.13719 10.764 5.91007 12.5409 5.95012 14.5137C5.9901 16.4864 7.28823 18.2121 9.17256 18.7976C11.0568 19.383 13.1043 18.6967 14.2552 17.094C15.1242 16.9986 15.9704 16.7542 16.7565 16.3715C15.9009 19.1225 13.3426 20.9867 10.4618 20.9583C7.58109 20.9301 5.05978 19.0161 4.25824 16.249C3.45665 13.4819 4.56462 10.5165 6.98422 8.95297Z" fill="#0891B2"/></svg>`,
    history: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5a6.5 6.5 0 106.5 6.5H13a5 5 0 11-5-5V4l3-3-3-3v2.5z" fill="currentColor"/></svg>`,
    refresh: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.65 2.35A7 7 0 1014.25 8h-1.5a5.5 5.5 0 11-1.1-3.4l1.1 1.1.9-2.35z" fill="currentColor"/></svg>`,
    'git-compare': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4V12M13.5 4V12M9 8h2M6 8H4M8 2L10 4L8 6M8 10l-2 2 2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    trash: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h12M5 3V2a1 1 0 011-1h4a1 1 0 011 1v1M3 3v11a1 1 0 001 1h8a1 1 0 001-1V3M6 6v6M10 6v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'file-edit': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 1.5l2 2-7 7-3 .5.5-3 7.5-7.5zM14 6v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    minus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'color-palette': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5a6.5 6.5 0 00-1.3 12.87c.7.13 1.3-.5 1.3-1.17v-.9c0-.8.4-1.1.9-1.3 1-.3 1.6-1.3 1.6-2.4a3 3 0 00-3-3c-.8 0-1.5.3-2 .8-.5.4-.5 1.1 0 1.5.4.5 1.1.5 1.5 0 .2-.2.4-.3.5-.3a1 1 0 011 1c0 .4-.2.7-.5.9-.6.4-1 1-1 1.7v.9c0 .7.5 1.3 1.2 1.2A6.5 6.5 0 008 1.5z" fill="currentColor"/><circle cx="5" cy="6" r="1" fill="#ef4444"/><circle cx="7" cy="4" r="1" fill="#f59e0b"/><circle cx="10" cy="5" r="1" fill="#22c55e"/><circle cx="11" cy="8" r="1" fill="#3b82f6"/></svg>`,
    'paint-bucket': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.5 1L3 7.5l5.5 5.5L15 6.5 9.5 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M1 13s1-2 2-2 2 2 2 2-1 2-2 2-2-2-2-2z" fill="currentColor"/><path d="M5 7.5h6" stroke="currentColor" stroke-width="1.2"/></svg>`,
    contrast: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M8 2v12a6 6 0 000-12z" fill="currentColor"/></svg>`,
};

// =============================================================================
// Extension to Icon Type Mapping
// =============================================================================

const extensionMap: Record<string, keyof typeof icons> = {
    // JavaScript / TypeScript
    'js': 'javascript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'jsx': 'react',
    'ts': 'typescript',
    'tsx': 'react',

    // Data files
    'json': 'json',
    'md': 'markdown',
    'markdown': 'markdown',

    // Config files
    'ini': 'config',
    'cfg': 'config',
    'config': 'config',
    'toml': 'config',
    'yaml': 'yaml',
    'yml': 'yaml',
    'env': 'config',

    // Web files
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'css',
    'less': 'css',
    'svg': 'svg',
    'xml': 'xml',

    // Images
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'webp': 'image',
    'bmp': 'image',
    'ico': 'image',

    // Textures (League-specific)
    'dds': 'texture',
    'tex': 'texture',
    'tga': 'texture',

    // League of Legends specific
    'bin': 'bin',
    'skn': 'model',
    'skl': 'skeleton',
    'anm': 'animation',
    'scb': 'model',
    'sco': 'model',
    'wad': 'wad',

    // Text files
    'txt': 'text',
    'log': 'text',

    // Programming
    'py': 'python',
    'pyw': 'python',
    'rs': 'rust',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'ps1': 'shell',
    'bat': 'shell',
    'cmd': 'shell',

    // Media
    'mp4': 'video',
    'webm': 'video',
    'avi': 'video',
    'mov': 'video',
    'mkv': 'video',
    'mp3': 'audio',
    'wav': 'audio',
    'ogg': 'audio',
    'flac': 'audio',

    // Lock files
    'lock': 'lock',

    // Git
    'gitignore': 'git',
    'gitattributes': 'git',

    // Archives
    'zip': 'wad',
    'rar': 'wad',
    '7z': 'wad',
};

// =============================================================================
// Exported Functions
// =============================================================================

/**
 * Get file icon SVG based on extension
 */
export function getFileIcon(name: string, isFolder: boolean, isExpanded = false): string {
    if (isFolder) {
        return isExpanded ? icons.folderOpen : icons.folder;
    }

    // Defensive check for undefined/null name
    if (!name) {
        return icons.file;
    }

    const ext = name.split('.').pop()?.toLowerCase() || '';
    const iconType = extensionMap[ext];
    return iconType ? icons[iconType] : icons.file;
}

/**
 * Get expander/chevron icon
 */
export function getExpanderIcon(isExpanded: boolean): string {
    return isExpanded ? icons.chevronDown : icons.chevronRight;
}

/**
 * Get specific icon by name
 */
export function getIcon(name: keyof typeof icons): string {
    return icons[name] || icons.file;
}

/**
 * Get toast notification icon
 */
export function getToastIcon(type: 'info' | 'success' | 'warning' | 'error'): string {
    return icons[type] || icons.info;
}

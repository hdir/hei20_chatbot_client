/**
 * Theme tokens used by HeiChatClient.
 * Brand palette (from Farger.pdf):
 *   DYP GRØNN      #062330
 *   MØRK GRØNN     #02404A
 *   SJØ-GRØNN      #02636C
 *   PASTELL HUD    #FEEEDB
 *   PASTELL LAV.   #EDE5F3
 *   PASTELL GRØNN  #E1EFE3
 *   HVIT           #FFFFFF
 *
 * Each theme must expose the same keys.
 */

const light = {
    name: 'light',
    label: 'Lys',
    swatch: '#FFFFFF',

    appBackground: '#F2F2F2',
    containerBackground: '#FFFFFF',
    containerBorder: 'rgba(0,0,0,0.06)',
    cardBoxShadow: '0px 10px 30px rgba(0,0,0,0.12)',

    headerGradientStart: 'rgba(255,255,255,1.0)',
    headerGradientEnd: 'rgba(255,255,255,0.7)',

    panelBackground: '#FFFFFF',
    panelBorder: 'rgba(0,0,0,0.08)',
    panelBorderSubtle: 'rgba(0,0,0,0.06)',

    backdropColor: 'rgba(0,0,0,0.25)',
    pillBackground: 'rgba(255,255,255,0.7)',
    pillText: '#000000',

    bubbleUserBackground: '#EBECEC',
    bubbleUserText: '#767676',
    bubbleSourcesBackground: '#EBECEC',
    bubbleSourcesTail: '#EBECEC',

    inputBackground: '#FFFFFF',
    inputBorder: '#000000',
    inputText: '#111827',
    inputPlaceholder: '#9ca3af',

    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textSubtle: '#767676',
    link: '#1d4ed8',

    shadowColor: '#000000',
    typingDot: '#111827',
    typingIconColor: '#02636C',
    iconColor: 'darkgrey',

    logoPrimary: '#212121',
    logoSecondary: '#FFFFFF',
};

const dark = {
    name: 'dark',
    label: 'Mørk',
    swatch: '#02404A',

    appBackground: '#062330',
    containerBackground: '#02404A',
    containerBorder: 'rgba(255,255,255,0.08)',
    cardBoxShadow: '0px 10px 30px rgba(0,0,0,0.7)',

    headerGradientStart: 'rgba(2,64,74,1.0)',
    headerGradientEnd: 'rgba(2,64,74,0.7)',

    panelBackground: '#02636C',
    panelBorder: 'rgba(255,255,255,0.12)',
    panelBorderSubtle: 'rgba(255,255,255,0.08)',

    backdropColor: 'rgba(0,0,0,0.7)',
    pillBackground: 'rgba(255,255,255,0.1)',
    pillText: '#FFFFFF',

    bubbleUserBackground: '#062330',
    bubbleUserText: '#E1EFE3',
    bubbleSourcesBackground: '#062330',
    bubbleSourcesTail: '#062330',

    inputBackground: '#02636C',
    inputBorder: '#E1EFE3',
    inputText: '#FFFFFF',
    inputPlaceholder: '#9AB3B6',

    textPrimary: '#FFFFFF',
    textSecondary: '#E1EFE3',
    textSubtle: '#9FB5A6',
    link: '#8EC9FF',

    shadowColor: '#000000',
    typingDot: '#E1EFE3',
    typingIconColor: '#E1EFE3',
    iconColor: '#FFFFFF',

    logoPrimary: '#FFFFFF',
    logoSecondary: '#02404A',
};

const sea = {
    name: 'sea',
    label: 'Sjø',
    swatch: '#02636C',

    appBackground: '#E1EFE3',
    containerBackground: '#FFFFFF',
    containerBorder: 'rgba(2,64,74,0.12)',
    cardBoxShadow: '0px 10px 30px rgba(2,64,74,0.18)',

    headerGradientStart: 'rgba(225,239,227,1.0)',
    headerGradientEnd: 'rgba(225,239,227,0.7)',

    panelBackground: '#FFFFFF',
    panelBorder: 'rgba(2,64,74,0.12)',
    panelBorderSubtle: 'rgba(2,64,74,0.08)',

    backdropColor: 'rgba(2,35,48,0.3)',
    pillBackground: 'rgba(255,255,255,0.85)',
    pillText: '#02404A',

    bubbleUserBackground: '#CFE3D3',
    bubbleUserText: '#062330',
    bubbleSourcesBackground: '#E1EFE3',
    bubbleSourcesTail: '#E1EFE3',

    inputBackground: '#FFFFFF',
    inputBorder: '#02636C',
    inputText: '#062330',
    inputPlaceholder: '#78909C',

    textPrimary: '#062330',
    textSecondary: '#02404A',
    textSubtle: '#5E7A6A',
    link: '#02636C',

    shadowColor: '#02404A',
    typingDot: '#02636C',
    typingIconColor: '#02636C',
    iconColor: '#02404A',

    logoPrimary: '#02404A',
    logoSecondary: '#FFFFFF',
};

const lavender = {
    name: 'lavender',
    label: 'Lavendel',
    swatch: '#EDE5F3',

    appBackground: '#EDE5F3',
    containerBackground: '#FFFFFF',
    containerBorder: 'rgba(93,64,122,0.12)',
    cardBoxShadow: '0px 10px 30px rgba(93,64,122,0.18)',

    headerGradientStart: 'rgba(237,229,243,1.0)',
    headerGradientEnd: 'rgba(237,229,243,0.7)',

    panelBackground: '#FFFFFF',
    panelBorder: 'rgba(93,64,122,0.12)',
    panelBorderSubtle: 'rgba(93,64,122,0.08)',

    backdropColor: 'rgba(46,30,61,0.3)',
    pillBackground: 'rgba(255,255,255,0.85)',
    pillText: '#5D407A',

    bubbleUserBackground: '#E0D3EE',
    bubbleUserText: '#3D2A55',
    bubbleSourcesBackground: '#EDE5F3',
    bubbleSourcesTail: '#EDE5F3',

    inputBackground: '#FFFFFF',
    inputBorder: '#7A5AA0',
    inputText: '#2E1E3D',
    inputPlaceholder: '#9C8FB0',

    textPrimary: '#2E1E3D',
    textSecondary: '#5D407A',
    textSubtle: '#7A6E8A',
    link: '#6B46B5',

    shadowColor: '#3D2A55',
    typingDot: '#6B46B5',
    typingIconColor: '#6B46B5',
    iconColor: '#5D407A',

    logoPrimary: '#5D407A',
    logoSecondary: '#FFFFFF',
};

const hud = {
    name: 'hud',
    label: 'Fersken',
    swatch: '#FEEEDB',

    appBackground: '#FEEEDB',
    containerBackground: '#FFFFFF',
    containerBorder: 'rgba(122,74,32,0.12)',
    cardBoxShadow: '0px 10px 30px rgba(122,74,32,0.15)',

    headerGradientStart: 'rgba(254,238,219,1.0)',
    headerGradientEnd: 'rgba(254,238,219,0.7)',

    panelBackground: '#FFFFFF',
    panelBorder: 'rgba(122,74,32,0.12)',
    panelBorderSubtle: 'rgba(122,74,32,0.08)',

    backdropColor: 'rgba(61,38,16,0.3)',
    pillBackground: 'rgba(255,255,255,0.85)',
    pillText: '#7A4A20',

    bubbleUserBackground: '#F7E0C4',
    bubbleUserText: '#5A3414',
    bubbleSourcesBackground: '#FEEEDB',
    bubbleSourcesTail: '#FEEEDB',

    inputBackground: '#FFFFFF',
    inputBorder: '#B8764A',
    inputText: '#3D2610',
    inputPlaceholder: '#B09788',

    textPrimary: '#3D2610',
    textSecondary: '#7A4A20',
    textSubtle: '#8A7060',
    link: '#B8764A',

    shadowColor: '#5A3414',
    typingDot: '#B8764A',
    typingIconColor: '#B8764A',
    iconColor: '#7A4A20',

    logoPrimary: '#7A4A20',
    logoSecondary: '#FFFFFF',
};

export const themes = { light, dark, sea, lavender, hud };
export const themeList = [light, dark, sea, lavender, hud];
export const defaultThemeName = 'light';

// @ts-nocheck
// CRACO ser etter denne fila i mappa kommandoen kjøres fra (client/).
// Uten en config-fil avbryter craco med
// "craco: Config file not found", så fila må ligge her.
module.exports = {
    babel: {
        presets: [
            [
                "@babel/preset-react",
                {
                    runtime: "automatic",
                },
            ],
        ],
    },
};

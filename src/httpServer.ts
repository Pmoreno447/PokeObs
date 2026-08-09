import express from "express";
import { userConfig } from "./config/userConfig/userConfig.js";
import fs from 'node:fs';

const app = express()
const HTTP_PORT = userConfig.httpServer.port;

app.get('/medallas/:numero', (req, res) => {
    if(parseInt(req.params.numero)<1 || parseInt(req.params.numero)>8){
        res.status(404).send("No existe esa medalla");
    }
    else{
        const plantilla = fs.readFileSync('src/resources/html/medallas.html', 'utf-8');
        const html = plantilla.replace(/__NUMERO_MEDALLA__/g, req.params.numero);
        res.send(html);
    }
})

app.listen(HTTP_PORT, () => {
  console.log(`Example app listening on port ${HTTP_PORT}`)
})

app.use('/img', express.static('src/resources/img'));
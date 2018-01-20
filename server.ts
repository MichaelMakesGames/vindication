import { generate } from './mapgen'
import * as bodyParser from 'body-parser';
import * as express from 'express';

const app = express();

app.use(express.static('public'));
app.use(bodyParser.json())

app.post('/generate', (req, res) => {
  res.send(generate(req.body));
});

app.listen(3000);
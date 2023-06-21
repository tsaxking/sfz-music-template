import { Router } from 'express';
import { Status } from '../structure/status';
import { getTemplate } from '../files';
import { MAIN } from '../databases';

const router = Router();


router.get('/', async (req, res) => {
    const { key } = req.query;

    if (!key || key !== process.env.ADMIN_KEY) return Status.from('admin.invalidKey', req).send(res);

    const html = await getTemplate('/admin', {
        serverKey: process.env.ADMIN_KEY
    });
    res.send(html);
});


router.post('/database', async (req, res, next) => {
    res.json(await MAIN.info());
});


// TODO: build table query search route
router.post('/table', async (req, res, next) => {});

export default router;
import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';

import IndexPage from '@/pages/home/index';
import MotorTestPage from '@/pages/motortest/motortest';

const router = createBrowserRouter(createRoutesFromElements(<>
  <Route path="/" element={<IndexPage/>}>
  </Route>
  <Route path="/motortest" element={<MotorTestPage/>} />
</>));

export default router;

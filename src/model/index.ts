import mongoose from 'mongoose';

mongoose.Promise = global.Promise;

export {mongoose} ;
export {UserModel} from './user.model';
export {ReceiptModel} from './receipt.model';

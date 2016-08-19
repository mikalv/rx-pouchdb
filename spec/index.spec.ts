/**
 * Copyright 2016 Stephane M. Catala
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * Limitations under the License.
 */
;
import Promise = require('bluebird')
import { Observable } from '@reactivex/rxjs'
import { schedule, unwrap } from './support/jasmine-bluebird'
import { __assign as assign } from 'tslib'
import { AssertionError } from 'assert'
import newRxPouchDb, { RxPouchDb } from '../src'

let pouchdbMock: any
let dbIoMock: any
let types: any[]
let rxPouchDbObject: any

beforeEach(() => {
  pouchdbMock = jasmine.createSpyObj('pouchdbMock',
    [ 'get', 'put', 'allDocs', 'bulkDocs' ])
  dbIoMock = jasmine.createSpyObj('dbIoMock', [ 'write', 'read' ])
  types = [ undefined, null, NaN, true, 42, 'foo', [ 42 ], { foo: 'foo' } ]
  rxPouchDbObject = jasmine.objectContaining({
    write: jasmine.any(Function),
    read: jasmine.any(Function)
  })
})

describe('factory newRxPouchDb (db: Object|Promise<Object>, ' +
'opts?: RxPouchDbFactoryOpts): RxPouchDb',
() => {
  it('should expose a `defaults` object property { read: ReadOpts, write: WriteOpts }',
  () => {
    expect(newRxPouchDb.defaults).toEqual({
      write: jasmine.any(Object),
      read: jasmine.any(Object)
    })
  })
  describe('when called with a non-null `db` Object argument',
  () => {
    let args: any[]
    beforeEach(() => {
      args = [ pouchdbMock, Promise.resolve(pouchdbMock) ]
    })
    it('should return a `RxPouchDb` object with `write` and `read` methods',
    () => {
      args.forEach(arg =>
        expect(newRxPouchDb(arg)).toEqual(rxPouchDbObject))
    })
  })
  describe('when called without a `db` argument, or with a `db` argument ' +
  'that is not a non-null Object', () => {
    it('should throw an `AssertionError` with `invalid argument`', () => {
      types.filter(val => !val || (typeof val !== 'object'))
      .forEach(arg =>
        expect(() => newRxPouchDb(arg)).toThrowError('invalid argument'))
    })
  })
  describe('when called with a `db` argument that is not PouchDB-like, ' +
  'or that resolves to an instance that is not PouchDB-like',
  () => {
    let results: RxPouchDb[]
    let docs: any[]
    beforeEach(() => {
      docs = [{ _id: 'foo' }]
      results = types
      .filter(val => val && (typeof val === 'object'))
      .reduce((args, arg) => args.concat([ arg, Promise.resolve(arg) ]), [])
      .map((val: any) => newRxPouchDb(val, { dbIo: dbIoMock }))
    })
    it('should return a `RxPouchDb` object with `write` and `read` methods ' +
    'that emit an `invalid PouchDB instance` Error', (done) => {
      Observable.from(results
      .reduce((results:Observable<any>[], rxPouchDb: RxPouchDb) =>
        results.concat([ rxPouchDb.write(docs), rxPouchDb.read(docs) ]), [])
      .map(result => result
        .isEmpty() // should never emit
        .catch((err, caught) => {
          expect(err).toEqual(jasmine.any(Error))
          expect(err.name).toBe('Error')
          expect(err.message).toBe('invalid PouchDB instance')
          return Observable.empty()
        })))
      .mergeAll()
      .subscribe(schedule(done.fail), schedule(done.fail), schedule(done))
    })
  })
  describe('when called with an `opts` argument', () => {
    describe('with an `opts.dbIo` instance', () => {
      describe('that is DbIo-like', () => {
        beforeEach((done) => {
          const rxPouchDb = newRxPouchDb(pouchdbMock, { dbIo: dbIoMock })
          rxPouchDb.write([{ _id: 'foo' }])
          .subscribe(() => {}, schedule(done), schedule(done))
        })
        it('should inject it in place of the default DbIo dependency', () => {
          expect(dbIoMock.write).toHaveBeenCalled()
        })
      })
      describe('that is not DbIo-like but truthy', () => {
        it('should throw an `invalid argument` AssertionError', () => {
          types
          .filter(val => val) // truthy
          .forEach(arg => {
            expect(() => newRxPouchDb(pouchdbMock, { dbIo: arg }))
            .toThrowError(AssertionError, 'invalid argument')
          })
        })
      })
    })
  })
})

describe('interface RxPouchDb: { write: Function, read: Function}', () => {
  let rxPouchDb: any
  beforeEach(() => {
    rxPouchDb = newRxPouchDb(pouchdbMock)
  })
  describe('RxPouchDb#write: <D extends VersionedDoc[]|VersionedDoc> ' +
  '(docs: Observable<D>|PromiseLike<D>|ArrayLike<D>) => ' +
  'Observable<DocRef[]|DocRef>', () => {
    describe('when given an Observable, a Promise-like or an Array-like object',
    () => {
      it('should return an Observable', () => {
        ;[ Observable.from([ 'foo' ]), Promise.resolve('foo'), [ 'foo' ]]
        .map(arg => rxPouchDb.write(arg))
        .forEach(res => expect(res).toEqual(jasmine.any(Observable)))
      })
      describe('that emits a document object extending { _id: string }', () => {
        let doc: any
        let ref: any
        let res: any
        beforeEach((done) => {
          doc = { _id: 'foo' }
          ref = { _id: 'foo', _rev: 'bar'}
          res = {}
          pouchdbMock.put.and.returnValue(Promise.resolve(ref))

          rxPouchDb.write(Observable.of(doc))
          .do(set(res, 'val'), set(res, 'err'), () => {})
          .subscribe(() => {}, schedule(done), schedule(done))

          function set (obj: Object, key: string) {
            return (val:any) => obj[key] = val
          }
        })
        it('should store that document in the wrapped db', () => {
          expect(pouchdbMock.put.calls.allArgs()).toEqual([
            jasmine.arrayContaining([ doc ])
          ])
        })
        it('should return an Observable that emits the { _id: string, ' +
        '_rev: string } reference returned from the db', () => {
          expect(res.val).toEqual(ref)
          expect(res.err).not.toBeDefined()
        })
      })
    })
  })
})
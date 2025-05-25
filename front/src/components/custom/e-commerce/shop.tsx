import { fakeStoreProducts } from '../../../assets/data/fakeStoreProducts.ts'
import ProductCard from './productCard.tsx'

function Shop() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {fakeStoreProducts.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

export default Shop
